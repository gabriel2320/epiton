import { describe, expect, it, vi } from "vitest";
import { loadTreeState, saveTreeState } from "./tree_state";

describe("tree_state", () => {
  it("parses nodes JSON from search_read", async () => {
    const client = {
      searchRead: vi.fn().mockResolvedValue([{ id: 1, nodes: "[1,2,3]" }]),
    };
    await expect(loadTreeState(client as never, "account.account", 1)).resolves.toEqual([1, 2, 3]);
  });

  it("soft-fails when model missing", async () => {
    const client = {
      searchRead: vi.fn().mockRejectedValue(new Error("Access denied")),
    };
    await expect(loadTreeState(client as never, "x", 1)).resolves.toEqual([]);
  });

  it("creates when no existing row", async () => {
    const client = {
      searchRead: vi.fn().mockResolvedValue([]),
      model: vi.fn().mockResolvedValue([9]),
    };
    await expect(saveTreeState(client as never, "party.party", 2, [4, 5])).resolves.toBe(true);
    expect(client.model).toHaveBeenCalledWith(
      "ir.ui.view_tree_state",
      "create",
      [[{ model: "party.party", user: 2, nodes: "[4,5]" }]],
      {},
    );
  });
});
