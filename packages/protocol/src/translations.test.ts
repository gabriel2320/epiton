import { describe, expect, it, vi } from "vitest";
import { loadTranslationCatalog } from "./translations";

describe("translations", () => {
  it("returns mapped rows", async () => {
    const client = {
      searchRead: vi
        .fn()
        .mockResolvedValue([{ name: "party.party,name", src: "Name", value: "Nombre" }]),
    };
    const rows = await loadTranslationCatalog(client as never, "es");
    expect(rows[0]?.value).toBe("Nombre");
  });

  it("soft-fails on empty lang or ACL", async () => {
    await expect(loadTranslationCatalog({} as never, "")).resolves.toEqual([]);
    const client = { searchRead: vi.fn().mockRejectedValue(new Error("denied")) };
    await expect(loadTranslationCatalog(client as never, "es")).resolves.toEqual([]);
  });
});
