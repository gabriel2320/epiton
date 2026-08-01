import { describe, expect, it } from "vitest";
import { domainTabStorageKey, noticeTone } from "./workspaceUi";

describe("workspaceUi", () => {
  it("maps notice messages to alert tones", () => {
    expect(noticeTone("Save failed")).toBe("danger");
    expect(noticeTone("Exporting…")).toBe("muted");
    expect(noticeTone("Saved ok")).toBe("accent");
    expect(noticeTone("Ready")).toBe("default");
  });

  it("builds stable domain-tab storage keys", () => {
    expect(domainTabStorageKey("party.party", null)).toBeNull();
    expect(domainTabStorageKey("party.party", [])).toBeNull();
    expect(domainTabStorageKey("party.party", [{ name: "Active" }, { name: "All" }])).toBe(
      "epiton.domainTab.party.party.Active|All",
    );
  });
});
