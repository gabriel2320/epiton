import { describe, expect, it } from "vitest";
import {
  applyChildScreenOnChange,
  applyChildScreenTrytonOnChange,
  beginChildScreenOnChange,
  cancelChildScreen,
  childScreenExitDecision,
  commitChildScreen,
  createChildScreen,
  hydrateChildScreen,
  removeChildScreen,
  setChildScreenRelationQueue,
  updateChildScreenValues,
  validateChildScreen,
} from "./childScreen";
import type { ViewField } from "./parse";
import { createRelationQueue, relationQueueWireValue } from "./screen";

function field(name: string, type: ViewField["type"], required = false): ViewField {
  return { name, type, required };
}

describe("child Screen contract", () => {
  it("bubbles a new child as one create command without mutating the parent queue", () => {
    const parent = createRelationQueue("one2many", [4]);
    const child = createChildScreen(
      "sale.line",
      { kind: "new" },
      {
        product: [9, "Product"],
        quantity: 2,
      },
    );
    const result = commitChildScreen(parent, child, {
      product: field("product", "many2one", true),
      quantity: field("quantity", "integer", true),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commandIndex).toBe(0);
    expect(result.command).toEqual({
      op: "create",
      values: { product: 9, quantity: 2 },
    });
    expect(result.queue.commands).toEqual([result.command]);
    expect(parent.commands).toEqual([]);
    expect(relationQueueWireValue(result.queue)).toEqual([["create", { product: 9, quantity: 2 }]]);
  });

  it("bubbles persisted and queued-create edits with stable target checks", () => {
    const parent = createRelationQueue("one2many", [4]);
    const persisted = createChildScreen(
      "sale.line",
      { kind: "record", id: 4 },
      {
        quantity: 3,
      },
    );
    const updated = commitChildScreen(parent, persisted, {
      quantity: field("quantity", "integer"),
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.command).toEqual({ op: "write", id: 4, values: { quantity: 3 } });

    const withCreate = {
      ...updated.queue,
      commands: [...updated.queue.commands, { op: "create" as const, values: { quantity: 1 } }],
    };
    const queued = createChildScreen(
      "sale.line",
      { kind: "queued-create", commandIndex: 1 },
      { quantity: 5 },
    );
    const replaced = commitChildScreen(withCreate, queued, {
      quantity: field("quantity", "integer"),
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.queue.commands).toEqual([
      { op: "write", id: 4, values: { quantity: 3 } },
      { op: "create", values: { quantity: 5 } },
    ]);

    const stale = commitChildScreen(parent, queued, {
      quantity: field("quantity", "integer"),
    });
    expect(stale).toEqual({
      ok: false,
      queue: parent,
      reason: "stale-target",
      issues: [],
    });
  });

  it("removes persisted children and discards queued creates immutably", () => {
    const parent = createRelationQueue("one2many", [4, 5]);
    parent.commands = [{ op: "create", values: { quantity: 1 } }];

    const discarded = removeChildScreen(parent, { kind: "queued-create", commandIndex: 0 });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) return;
    expect(discarded.command).toBeNull();
    expect(discarded.queue.commands).toEqual([]);

    const removed = removeChildScreen(discarded.queue, { kind: "record", id: 4 }, "remove");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.command).toEqual({ op: "remove", id: 4 });
    expect(removed.queue.ids).toEqual([5]);
    expect(parent.ids).toEqual([4, 5]);
    expect(parent.commands).toEqual([{ op: "create", values: { quantity: 1 } }]);
  });

  it("validates required values and prefixes nested child paths before commit", () => {
    const parent = createRelationQueue("one2many", []);
    let child = createChildScreen(
      "sale.line",
      { kind: "new" },
      {
        product: null,
        moves: [],
      },
    );
    const moves = createRelationQueue("one2many", []);
    moves.commands = [{ op: "create", values: { quantity: 1 } }];
    child = setChildScreenRelationQueue(child, "moves", moves);
    const fields = {
      product: field("product", "many2one", true),
      moves: field("moves", "one2many", true),
    };
    const nested = {
      moves: [{ code: "required" as const, path: ["location"] }],
    };

    expect(validateChildScreen(child, fields, nested)).toEqual([
      { code: "required", path: ["product"] },
      { code: "required", path: ["moves", "location"] },
    ]);
    const result = commitChildScreen(parent, child, fields, nested);
    expect(result).toEqual({
      ok: false,
      queue: parent,
      reason: "validation",
      issues: [
        { code: "required", path: ["product"] },
        { code: "required", path: ["moves", "location"] },
      ],
    });
    expect(parent.commands).toEqual([]);
  });

  it("blocks a persisted child until its server snapshot is hydrated", () => {
    const parent = createRelationQueue("one2many", [4]);
    const loading = createChildScreen("sale.line", { kind: "record", id: 4 });
    expect(commitChildScreen(parent, loading, { quantity: field("quantity", "integer") })).toEqual({
      ok: false,
      queue: parent,
      reason: "not-ready",
      issues: [],
    });

    const ready = hydrateChildScreen(loading, { quantity: 2 });
    const result = commitChildScreen(parent, ready, {
      quantity: field("quantity", "integer"),
    });
    expect(result.ok).toBe(true);
  });

  it("applies only the latest on_change patch for the same child identity", () => {
    const initial = createChildScreen(
      "sale.line",
      { kind: "record", id: 4 },
      {
        quantity: 1,
        amount: 10,
      },
    );
    const first = beginChildScreenOnChange(initial);
    const latest = beginChildScreenOnChange(first.child);

    const stale = applyChildScreenOnChange(latest.child, first.token, { amount: 20 });
    expect(stale).toBe(latest.child);
    const applied = applyChildScreenOnChange(latest.child, latest.token, { amount: 30 });
    expect(applied.screen.values).toEqual({ quantity: 1, amount: 30 });
  });

  it("translates server x2many patches into nested queues without touching the parent", () => {
    const parent = createRelationQueue("one2many", [4]);
    let child = createChildScreen("sale.line", { kind: "record", id: 4 }, { moves: [8] });
    const moves = createRelationQueue("one2many", [8]);
    moves.commands = [{ op: "create", values: { quantity: 1 } }];
    child = setChildScreenRelationQueue(child, "moves", moves);
    const pending = beginChildScreenOnChange(child);

    const patched = applyChildScreenTrytonOnChange(
      pending.child,
      pending.token,
      {
        moves: {
          add: [[0, { id: 11, quantity: 2 }]],
          update: [
            { id: 8, quantity: 3 },
            { id: -1, quantity: 4 },
          ],
        },
      },
      { moves: field("moves", "one2many") },
    );

    expect(patched.screen.relationQueues.moves).toEqual({
      kind: "one2many",
      ids: [11, 8],
      baselineIds: [8],
      commands: [
        { op: "create", values: { quantity: 4 } },
        { op: "add", id: 11 },
        { op: "write", id: 11, values: { quantity: 2 } },
        { op: "write", id: 8, values: { quantity: 3 } },
      ],
    });
    expect(parent).toEqual(createRelationQueue("one2many", [4]));
  });

  it("requires confirmation for navigation and Cancel restores baseline queues", () => {
    let child = createChildScreen(
      "sale.line",
      { kind: "record", id: 4 },
      {
        quantity: 1,
        moves: [8],
      },
    );
    child = setChildScreenRelationQueue(child, "moves", createRelationQueue("one2many", [8]));
    expect(childScreenExitDecision(child)).toEqual({ kind: "allow" });

    child = updateChildScreenValues(child, { ...child.screen.values, quantity: 2 });
    const moves = createRelationQueue("one2many", [8]);
    moves.commands = [{ op: "create", values: { quantity: 1 } }];
    child = setChildScreenRelationQueue(child, "moves", moves);
    expect(childScreenExitDecision(child)).toEqual({
      kind: "confirm-discard",
      reason: "unsaved-child",
    });

    const pending = beginChildScreenOnChange(child);
    const cancelled = cancelChildScreen(pending.child);
    expect(cancelled.generation).toBe(1);
    expect(cancelled.onChangeRevision).toBe(0);
    expect(cancelled.screen.values).toEqual({ quantity: 1, moves: [8] });
    expect(cancelled.screen.relationQueues.moves).toEqual({
      kind: "one2many",
      ids: [8],
      baselineIds: [8],
      commands: [],
    });
    expect(childScreenExitDecision(cancelled)).toEqual({ kind: "allow" });
    expect(applyChildScreenOnChange(cancelled, pending.token, { quantity: 99 })).toBe(cancelled);
  });

  it("preserves nested M2M record commands together with membership deltas", () => {
    const tags = createRelationQueue("many2many", [1, 2]);
    tags.ids = [2, 3];
    tags.commands = [
      { op: "write", id: 2, values: { name: "Updated" } },
      { op: "create", values: { name: "New" } },
    ];

    expect(relationQueueWireValue(tags)).toEqual([
      ["write", [2], { name: "Updated" }],
      ["create", { name: "New" }],
      ["add", [3]],
      ["remove", [1]],
    ]);

    tags.ids = [2, 3];
    tags.commands = [{ op: "delete", id: 1 }];
    expect(relationQueueWireValue(tags)).toEqual([
      ["delete", [1]],
      ["add", [3]],
    ]);
  });
});
