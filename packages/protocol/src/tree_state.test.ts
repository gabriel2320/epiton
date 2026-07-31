import { describe, expect, it, vi } from "vitest";
import { loadTreeState, saveTreeState, serializeTreeDomain } from "./tree_state";

describe("tree_state", () => {
  it("serializes domain stably", () => {
    expect(serializeTreeDomain([])).toBe("[]");
    expect(serializeTreeDomain([["active", "=", true]])).toBe('[["active","=",true]]');
  });

  it("parses nodes JSON from search_read with domain key", async () => {
    const client = {
      searchRead: vi.fn().mockResolvedValue([{ id: 1, nodes: "[1,2,3]" }]),
    };
    const domain = [["active", "=", true]];
    await expect(loadTreeState(client as never, "account.account", 1, {}, domain)).resolves.toEqual(
      [1, 2, 3],
    );
    expect(client.searchRead).toHaveBeenCalledWith(
      "ir.ui.view_tree_state",
      [
        ["model", "=", "account.account"],
        ["user", "=", 1],
        ["domain", "=", serializeTreeDomain(domain)],
      ],
      ["nodes", "childs", "model", "domain"],
      0,
      1,
      null,
      {},
    );
  });

  it("soft-fails when model missing", async () => {
    const client = {
      searchRead: vi.fn().mockRejectedValue(new Error("Access denied")),
    };
    await expect(loadTreeState(client as never, "x", 1)).resolves.toEqual([]);
  });

  it("creates when no existing row including domain", async () => {
    const client = {
      searchRead: vi.fn().mockResolvedValue([]),
      model: vi.fn().mockResolvedValue([9]),
    };
    const domain = [["company", "=", 1]];
    await expect(
      saveTreeState(client as never, "party.party", 2, [4, 5], {}, domain),
    ).resolves.toBe(true);
    expect(client.model).toHaveBeenCalledWith(
      "ir.ui.view_tree_state",
      "create",
      [
        [
          {
            model: "party.party",
            user: 2,
            domain: serializeTreeDomain(domain),
            nodes: "[4,5]",
          },
        ],
      ],
      {},
    );
  });
});
