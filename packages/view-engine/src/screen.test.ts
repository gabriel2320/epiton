import { describe, expect, it } from "vitest";
import type { ViewField } from "./parse";
import {
  createRelationQueue,
  createScreen,
  hydrateScreenFromRecord,
  hydrateSelectedScreen,
  idsFromRelationValue,
  relationQueueWireValue,
  screenForSelection,
  screenIsDirty,
  screenValuesForSave,
  setScreenRelationQueue,
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

  it("clears record A immediately when the host selects record B", () => {
    const lines = createRelationQueue("one2many", [8]);
    lines.commands = [{ op: "write", id: 8, values: { quantity: 4 } }];
    const first = setScreenRelationQueue(
      createScreen("sale.sale", 7, { name: "S-7", lines: [8] }),
      "lines",
      lines,
    );

    const waitingForSecond = screenForSelection(first, "sale.sale", 9);
    expect(waitingForSecond).toEqual(createScreen("sale.sale", 9));
    expect(screenIsDirty(waitingForSecond)).toBe(false);
  });

  it("ignores a late record A response while record B is selected", () => {
    const waitingForSecond = createScreen("sale.sale", 9);
    const stale = hydrateSelectedScreen(waitingForSecond, "sale.sale", 9, {
      id: 7,
      name: "S-7",
    });
    expect(stale).toBe(waitingForSecond);

    const hydrated = hydrateSelectedScreen(waitingForSecond, "sale.sale", 9, {
      id: 9,
      name: "S-9",
    });
    expect(hydrated.values.name).toBe("S-9");
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
});
