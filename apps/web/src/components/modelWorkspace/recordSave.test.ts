import type { ViewField } from "@epiton/view-engine";
import { describe, expect, it, vi } from "vitest";
import {
  createRelationQueue,
  createScreen,
  relationQueueWithTrytonTimestamps,
  screenIsDirty,
  setScreenRelationQueue,
  updateScreenValues,
} from "../../lib/screen";
import {
  leaveWriteModeTransition,
  readRecordSnapshot,
  type SaveRecordOptions,
  saveRecord,
  screenAfterDiscard,
  screenAfterNewDefaults,
} from "./recordSave";

const model = "party.party";
const context = { language: "es" };
const fields: Record<string, ViewField> = {
  name: { name: "name", type: "char" },
  active: { name: "active", type: "boolean" },
  company: { name: "company", type: "many2one", relation: "company.company" },
  internal: { name: "internal", type: "char", readonly: true },
};

function saveOptions(
  overrides: Partial<SaveRecordOptions> = {},
): SaveRecordOptions & { generation: { current: number } } {
  const generation = { current: 3 };
  return {
    client: { model: vi.fn(async () => true) },
    model,
    selectedId: 7,
    fieldMeta: fields,
    context,
    getGeneration: () => generation.current,
    getScreen: () =>
      createScreen(model, 7, {
        name: "Ada",
        active: 0,
        company: [5, "Epiton"],
        internal: "not writable",
      }),
    flushPendingOnChange: vi.fn(async () => {}),
    bumpScreenGeneration: vi.fn(() => {
      generation.current += 1;
    }),
    ...overrides,
    generation,
  };
}

describe("recordSave", () => {
  it("reads and hydrates the committed snapshot without accepting another record", async () => {
    const client: SaveRecordOptions["client"] = {
      model: vi.fn(async () => [
        {
          id: 7,
          name: "Ada",
          company: 5,
          "company.": { rec_name: "Epiton" },
          _timestamp: "21.000000",
        },
      ]),
    };

    await expect(
      readRecordSnapshot(client, model, 7, ["id", "name", "company", "company.rec_name"], fields, {
        language: "es",
      }),
    ).resolves.toEqual({
      recordId: 7,
      values: {
        id: 7,
        name: "Ada",
        company: [5, "Epiton"],
        _timestamp: "21.000000",
      },
    });
    expect(client.model).toHaveBeenCalledWith(
      model,
      "read",
      [[7], ["id", "name", "company", "company.rec_name"]],
      { language: "es" },
    );

    const mismatchedClient: SaveRecordOptions["client"] = {
      model: vi.fn(async () => [{ id: 8, name: "Other" }]),
    };
    await expect(
      readRecordSnapshot(mismatchedClient, model, 7, ["id", "name"], fields, context),
    ).resolves.toBeNull();
  });

  it("applies late default_get only to the same pristine new Screen", () => {
    const expected = { generation: 2, model, recordId: null };
    const pristine = createScreen(model, null);

    const withDefaults = screenAfterNewDefaults(expected, 2, pristine, {
      name: "Default party",
    });
    expect(withDefaults.values).toEqual({ name: "Default party" });
    expect(withDefaults.baseline).toEqual({ name: "Default party" });

    const edited = updateScreenValues(pristine, { name: "User wins" });
    expect(screenAfterNewDefaults(expected, 2, edited, { name: "Too late" })).toBe(edited);
    expect(screenAfterNewDefaults(expected, 3, pristine, { name: "Wrong generation" })).toBe(
      pristine,
    );
  });

  it("flushes and writes the frozen Screen snapshot using the existing RPC shape", async () => {
    const order: string[] = [];
    const client: SaveRecordOptions["client"] = {
      model: vi.fn(async () => {
        order.push("rpc");
        return true;
      }),
    };
    const history: string[] = [];
    const options = saveOptions({
      client,
      flushPendingOnChange: vi.fn(async () => {
        order.push("flush");
      }),
      bumpScreenGeneration: vi.fn(() => {
        order.push("bump");
      }),
      onHistory: (action) => {
        order.push("history");
        history.push(action);
      },
    });

    await expect(saveRecord(options)).resolves.toEqual({
      id: 7,
      savedValues: {
        name: "Ada",
        active: 0,
        company: [5, "Epiton"],
        internal: "not writable",
      },
    });
    expect(client.model).toHaveBeenCalledWith(
      model,
      "write",
      [[7], { name: "Ada", active: false, company: 5 }],
      context,
    );
    expect(order).toEqual(["flush", "bump", "rpc", "history"]);
    expect(history).toEqual(["write"]);
  });

  it("writes parent and nested optimistic locks only through RPC context", async () => {
    const client: SaveRecordOptions["client"] = {
      model: vi.fn(async () => true),
    };
    let screen = createScreen(model, 7, {
      id: 7,
      name: "Ada",
      _timestamp: "20.000000",
    });
    const lines = relationQueueWithTrytonTimestamps(createRelationQueue("one2many", [11]), {
      "party.address,11": "15.000000",
    });
    screen = setScreenRelationQueue(screen, "addresses", lines);
    const options = saveOptions({ client, getScreen: () => screen });

    await saveRecord(options);

    expect(client.model).toHaveBeenCalledWith(model, "write", [[7], { name: "Ada" }], {
      language: "es",
      _timestamp: {
        "party.party,7": "20.000000",
        "party.address,11": "15.000000",
      },
    });
  });

  it("cancels save after flush when the Screen generation changed", async () => {
    const options = saveOptions();
    options.flushPendingOnChange = vi.fn(async () => {
      options.generation.current += 1;
    });

    await expect(saveRecord(options)).rejects.toThrow("Save cancelled because the Screen changed");
    expect(options.client.model).not.toHaveBeenCalled();
    expect(options.bumpScreenGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unhydrated selected Screen before write", async () => {
    const options = saveOptions({ getScreen: () => createScreen(model, 7) });

    await expect(saveRecord(options)).rejects.toThrow("Selected record is still loading");
    expect(options.client.model).not.toHaveBeenCalled();
    expect(options.bumpScreenGeneration).not.toHaveBeenCalled();
  });

  it("creates a new record with the existing RPC shape and array id response", async () => {
    const client: SaveRecordOptions["client"] = {
      model: vi.fn(async () => [42]),
    };
    const history: string[] = [];
    const options = saveOptions({
      client,
      selectedId: null,
      getScreen: () => createScreen(model, null, { name: "New", company: [8, "Main"] }),
      onHistory: (action) => history.push(action),
    });

    await expect(saveRecord(options)).resolves.toEqual({
      id: 42,
      savedValues: { name: "New", company: [8, "Main"] },
    });
    expect(client.model).toHaveBeenCalledWith(
      model,
      "create",
      [[{ name: "New", company: 8 }]],
      context,
    );
    expect(history).toEqual(["create"]);
  });

  it("rebuilds a clean discard snapshot and describes the leave-mode transition", () => {
    expect(screenAfterDiscard(model, 7)).toBeNull();
    const restored = screenAfterDiscard(model, 7, { name: "Server" });
    expect(restored).not.toBeNull();
    expect(restored && screenIsDirty(restored)).toBe(false);
    expect(leaveWriteModeTransition("write")).toEqual({
      mode: "read",
      bumpGeneration: true,
    });
    expect(leaveWriteModeTransition("read")).toEqual({
      mode: "read",
      bumpGeneration: false,
    });
  });
});
