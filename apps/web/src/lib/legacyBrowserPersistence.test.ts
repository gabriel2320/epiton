import { describe, expect, it } from "vitest";
import { clearLegacyEpitonStorage } from "./legacyBrowserPersistence";

class FakeStorage {
  private readonly keys: string[];

  constructor(keys: string[]) {
    this.keys = [...keys];
  }

  get length() {
    return this.keys.length;
  }

  key(index: number) {
    return this.keys[index] ?? null;
  }

  removeItem(key: string) {
    const index = this.keys.indexOf(key);
    if (index >= 0) this.keys.splice(index, 1);
  }

  snapshot() {
    return [...this.keys];
  }
}

describe("legacy browser persistence cleanup", () => {
  it("removes every Epiton key while preserving unrelated application data", () => {
    const storage = new FakeStorage([
      "epiton.connection",
      "other.theme",
      "epiton.domainTab.party.party.Active",
      "epiton.tree.hidden.party.party",
    ]);

    expect(clearLegacyEpitonStorage(storage)).toBe(3);
    expect(storage.snapshot()).toEqual(["other.theme"]);
  });
});
