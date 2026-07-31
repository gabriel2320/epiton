import { describe, expect, it, vi } from "vitest";
import { createViewSearch, loadViewSearches } from "./view_search";

describe("view_search", () => {
  it("maps search_read rows and parses domain JSON", async () => {
    const client = {
      searchRead: vi.fn().mockResolvedValue([
        { id: 3, name: "Active", model: "party.party", domain: '[["active","=",true]]', user: 1 },
        {
          id: 4,
          name: "Shared",
          model: "party.party",
          domain: [["active", "=", false]],
          user: null,
        },
      ]),
    };
    const rows = await loadViewSearches(client as never, "party.party", 1);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.domain).toEqual([["active", "=", true]]);
    expect(rows[1]?.user).toBeNull();
  });

  it("soft-fails when ACL blocks view_search", async () => {
    const client = {
      searchRead: vi.fn().mockRejectedValue(new Error("Access denied")),
    };
    await expect(loadViewSearches(client as never, "party.party", 1)).resolves.toEqual([]);
  });

  it("creates with JSON string domain", async () => {
    const client = {
      model: vi.fn().mockResolvedValue([9]),
    };
    const id = await createViewSearch(client as never, {
      name: " Mine ",
      model: "party.party",
      domain: [["active", "=", true]],
      user: 2,
    });
    expect(id).toBe(9);
    expect(client.model).toHaveBeenCalledWith(
      "ir.ui.view_search",
      "create",
      [[{ name: "Mine", model: "party.party", domain: '[["active","=",true]]', user: 2 }]],
      {},
    );
  });
});
