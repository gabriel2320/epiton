import { describe, expect, it } from "vitest";
import type { ViewField } from "./parse";
import {
  acceptAsyncScreenUpdate,
  createRelationQueue,
  createScreen,
  hydrateScreenFromRecord,
  hydrateSelectedScreen,
  idsFromRelationValue,
  isScreenReadyToSave,
  relationQueueWireValue,
  screenForSelection,
  screenIsDirty,
  screenValuesForSave,
  setScreenRelationQueue,
  shouldApplyNewDefaults,
  updateScreenValues,
} from "./screen";

function field(name: string, type: ViewField["type"], readonly = false): ViewField {
  return { name, type, readonly };
}

describe("screen", () => {
  it("normalizes relation ids without duplicating them", () => {
    expect(idsFromRelationValue([1, [2, "Two"], { id: 3 }, 1])).toEqual([1, 2, 3]);
    expect(
      idsFromRelationValue([
        ["add", [1, 2]],
        ["write", [3], { name: "Three" }],
        ["remove", [2]],
        ["delete", [9]],
        ["create", { name: "Pending" }],
      ]),
    ).toEqual([1, 3]);
  });

  it("tracks scalar and parent-owned relation changes", () => {
    const base = createScreen("sale.sale", 7, { name: "S-7", lines: [1] });
    expect(screenIsDirty(base)).toBe(false);
    expect(screenIsDirty(updateScreenValues(base, { ...base.values, name: "S-8" }))).toBe(true);

    const lines = createRelationQueue("one2many", [1]);
    lines.commands = [{ op: "create", values: { product: 4, quantity: 2 } }];
    const queued = setScreenRelationQueue(base, "lines", lines);
    expect(screenIsDirty(queued)).toBe(true);
    expect(relationQueueWireValue(lines)).toEqual([["create", { product: 4, quantity: 2 }]]);
  });

  it("encodes the existing Tryton values shape and skips readonly fields", () => {
    const fields: Record<string, ViewField> = {
      active: field("active", "boolean"),
      party: field("party", "many2one"),
      tags: field("tags", "many2many"),
      lines: field("lines", "one2many"),
      note: field("note", "text"),
      locked: field("locked", "char", true),
    };
    const screen = createScreen("sale.sale", 7, {
      active: 1,
      party: [9, "Party"],
      tags: [2, 3],
      lines: [4, 5],
      note: "Ready",
      locked: "server only",
    });

    expect(screenValuesForSave(screen, fields)).toEqual({
      active: true,
      party: 9,
      tags: [["add", [2, 3]]],
      lines: [
        ["add", [4]],
        ["add", [5]],
      ],
      note: "Ready",
    });
  });

  it("prefers queued O2M commands and M2M deltas over relation snapshots", () => {
    const fields: Record<string, ViewField> = {
      tags: field("tags", "many2many"),
      lines: field("lines", "one2many"),
    };
    let screen = createScreen("sale.sale", 7, { tags: [1, 2], lines: [8] });
    const tags = createRelationQueue("many2many", [1, 2]);
    tags.ids = [2, 3];
    const lines = createRelationQueue("one2many", [8]);
    lines.commands = [
      { op: "write", id: 8, values: { quantity: 3 } },
      { op: "create", values: { quantity: 1 } },
    ];
    screen = setScreenRelationQueue(screen, "tags", tags);
    screen = setScreenRelationQueue(screen, "lines", lines);

    expect(screenValuesForSave(screen, fields)).toEqual({
      tags: [
        ["add", [3]],
        ["remove", [1]],
      ],
      lines: [
        ["write", [8], { quantity: 3 }],
        ["create", { quantity: 1 }],
      ],
    });
  });

  it("saves a parent-owned queue even when the relation was absent from the draft", () => {
    const fields: Record<string, ViewField> = {
      lines: field("lines", "one2many"),
    };
    const lines = createRelationQueue("one2many", undefined);
    lines.commands = [{ op: "create", values: { quantity: 1 } }];
    const screen = setScreenRelationQueue(createScreen("sale.sale", null), "lines", lines);

    expect(screenValuesForSave(screen, fields)).toEqual({
      lines: [["create", { quantity: 1 }]],
    });
  });

  it("isolates relation queues when a new record Screen is created", () => {
    const lines = createRelationQueue("one2many", [8]);
    lines.commands = [{ op: "write", id: 8, values: { quantity: 4 } }];
    const first = setScreenRelationQueue(
      createScreen("sale.sale", 7, { lines: [8] }),
      "lines",
      lines,
    );
    const second = createScreen("sale.sale", 9, { lines: [11] });

    expect(screenIsDirty(first)).toBe(true);
    expect(second.recordId).toBe(9);
    expect(second.relationQueues).toEqual({});
    expect(screenIsDirty(second)).toBe(false);
  });

  it("clears a dirty record A when external initial selection moves to record B", () => {
    const lines = createRelationQueue("one2many", [8]);
    lines.commands = [{ op: "write", id: 8, values: { quantity: 4 } }];
    const first = setScreenRelationQueue(
      createScreen("sale.sale", 7, { name: "S-7", lines: [8] }),
      "lines",
      lines,
    );

    const waitingForSecond = screenForSelection(first, "sale.sale", 9);
    expect(waitingForSecond).toEqual(createScreen("sale.sale", 9));
    expect(waitingForSecond.hydrated).toBe(false);
    expect(screenIsDirty(waitingForSecond)).toBe(false);
  });

  it("ignores a late record A response while record B is selected", () => {
    const waitingForSecond = createScreen("sale.sale", 9);
    const stale = hydrateSelectedScreen(waitingForSecond, "sale.sale", 9, 7, {
      name: "S-7",
    });
    expect(stale).toBe(waitingForSecond);

    const inconsistent = hydrateSelectedScreen(waitingForSecond, "sale.sale", 9, 9, {
      id: 7,
      name: "wrong-payload-id",
    });
    expect(inconsistent).toBe(waitingForSecond);

    const hydrated = hydrateSelectedScreen(waitingForSecond, "sale.sale", 9, 9, {
      name: "S-9",
    });
    expect(hydrated.values.name).toBe("S-9");
  });

  it("saves live relation queues without an Apply step", () => {
    const fields: Record<string, ViewField> = {
      lines: field("lines", "one2many"),
      tags: field("tags", "many2many"),
    };
    let screen = createScreen("sale.sale", 7, { name: "S-7" });
    const lines = createRelationQueue("one2many", undefined);
    lines.commands = [{ op: "create", values: { quantity: 2 } }];
    const tags = createRelationQueue("many2many", [1]);
    tags.ids = [1, 2];
    screen = setScreenRelationQueue(screen, "lines", lines);
    screen = setScreenRelationQueue(screen, "tags", tags);
    expect(screenValuesForSave(screen, fields)).toEqual({
      lines: [["create", { quantity: 2 }]],
      tags: [["add", [2]]],
    });
  });

  it("keeps unsaved queues across same-record refetches and resets for another record", () => {
    const lines = createRelationQueue("one2many", [8]);
    lines.commands = [{ op: "create", values: { quantity: 2 } }];
    const dirty = setScreenRelationQueue(
      createScreen("sale.sale", 7, { name: "S-7", lines: [8] }),
      "lines",
      lines,
    );

    expect(hydrateScreenFromRecord(dirty, "sale.sale", 7, { name: "refetched", lines: [8] })).toBe(
      dirty,
    );

    const next = hydrateScreenFromRecord(dirty, "sale.sale", 9, {
      name: "S-9",
      lines: [11],
    });
    expect(next.recordId).toBe(9);
    expect(next.values.name).toBe("S-9");
    expect(next.relationQueues).toEqual({});
  });

  it("rehydrates an open clean relation queue without dropping controlled state", () => {
    const clean = setScreenRelationQueue(
      createScreen("sale.sale", 7, { lines: [8] }),
      "lines",
      createRelationQueue("one2many", [8]),
    );

    const hydrated = hydrateScreenFromRecord(clean, "sale.sale", 7, { lines: [8, 9] });
    expect(hydrated.relationQueues.lines?.ids).toEqual([8, 9]);
    expect(screenIsDirty(hydrated)).toBe(false);
  });

  it("synthesizes an O2M id delta when no explicit commands exist", () => {
    const lines = createRelationQueue("one2many", [1, 2]);
    lines.ids = [2, 3];

    expect(relationQueueWireValue(lines)).toEqual([
      ["add", [3]],
      ["remove", [1]],
    ]);
  });

  it("blocks save until an existing record Screen is hydrated", () => {
    const loading = screenForSelection(createScreen("sale.sale", 7), "sale.sale", 9);
    expect(loading.hydrated).toBe(false);
    expect(isScreenReadyToSave(loading, 9)).toBe(false);
    const hydrated = hydrateSelectedScreen(loading, "sale.sale", 9, 9, { id: 9, name: "S-9" });
    expect(hydrated.hydrated).toBe(true);
    expect(isScreenReadyToSave(hydrated, 9)).toBe(true);
    expect(isScreenReadyToSave(createScreen("sale.sale", null), null)).toBe(true);
  });

  it("marks an existing Screen ready after hydrate even without values.id", () => {
    const loading = createScreen("sale.sale", 9);
    expect(loading.hydrated).toBe(false);
    expect(isScreenReadyToSave(loading, 9)).toBe(false);

    const hydrated = hydrateSelectedScreen(loading, "sale.sale", 9, 9, { name: "S-9" });
    expect(hydrated.values.id).toBeUndefined();
    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.values.name).toBe("S-9");
    expect(isScreenReadyToSave(hydrated, 9)).toBe(true);
  });

  it("rejects late default_get after the new draft was edited", () => {
    const expected = { generation: 1, model: "sale.sale", recordId: null as number | null };
    const current = { generation: 1, model: "sale.sale", recordId: null as number | null };
    const pristine = createScreen("sale.sale", null);
    expect(shouldApplyNewDefaults(expected, current, pristine)).toBe(true);

    const edited = updateScreenValues(pristine, { ...pristine.values, name: "typed" });
    expect(screenIsDirty(edited)).toBe(true);
    expect(shouldApplyNewDefaults(expected, current, edited)).toBe(false);

    const defaults = { name: "from-server", active: true };
    // Host applies defaults only when the helper says so — edited draft wins.
    const applied = shouldApplyNewDefaults(expected, current, edited)
      ? createScreen("sale.sale", null, defaults)
      : edited;
    expect(applied.values.name).toBe("typed");
    expect(applied.values.active).toBeUndefined();
  });

  it("rejects async Screen updates after identity or generation changes", () => {
    const expected = { generation: 1, model: "sale.sale", recordId: 7 as number | null };
    expect(
      acceptAsyncScreenUpdate(expected, { generation: 1, model: "sale.sale", recordId: 7 }),
    ).toBe(true);
    expect(
      acceptAsyncScreenUpdate(expected, { generation: 2, model: "sale.sale", recordId: 7 }),
    ).toBe(false);
    expect(
      acceptAsyncScreenUpdate(expected, { generation: 1, model: "sale.sale", recordId: 9 }),
    ).toBe(false);
    expect(
      acceptAsyncScreenUpdate(expected, { generation: 1, model: "sale.sale", recordId: null }),
    ).toBe(false);
  });

  it("invalidates deferred on_change work when generation bumps (discard/Save)", () => {
    const scheduled = { generation: 4, model: "sale.sale", recordId: 7 as number | null };
    // Host bumps generation on discard / exit write / Save start.
    const afterDiscard = { generation: 5, model: "sale.sale", recordId: 7 as number | null };
    expect(acceptAsyncScreenUpdate(scheduled, afterDiscard)).toBe(false);

    const afterSaveStart = { generation: 5, model: "sale.sale", recordId: 7 as number | null };
    expect(acceptAsyncScreenUpdate(scheduled, afterSaveStart)).toBe(false);

    // Stale catch path must also refuse to publish a notice.
    const afterIdentityChange = {
      generation: 4,
      model: "sale.sale",
      recordId: null as number | null,
    };
    expect(acceptAsyncScreenUpdate(scheduled, afterIdentityChange)).toBe(false);
  });

  it("keeps Save-without-Apply for live relation queues after hydrate", () => {
    const fields: Record<string, ViewField> = {
      lines: field("lines", "one2many"),
    };
    let screen = hydrateSelectedScreen(createScreen("sale.sale", 7), "sale.sale", 7, 7, {
      name: "S-7",
    });
    expect(isScreenReadyToSave(screen, 7)).toBe(true);
    const lines = createRelationQueue("one2many", undefined);
    lines.commands = [{ op: "create", values: { quantity: 2 } }];
    screen = setScreenRelationQueue(screen, "lines", lines);
    expect(screenValuesForSave(screen, fields)).toEqual({
      lines: [["create", { quantity: 2 }]],
    });
  });
});
