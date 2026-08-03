import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFieldsViewGet } from "@epiton/view-engine";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(dir, "fixtures");

describe("compat fixtures", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

  it("loads all fixtures", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it("parses party tree view fixture", () => {
    const raw = JSON.parse(readFileSync(join(fixturesDir, "03-party-tree-view.json"), "utf8"));
    const view = parseFieldsViewGet(raw.response.result);
    expect(view.type).toBe("tree");
    expect(view.fields.name?.type).toBe("char");
  });

  it("login fixture has session shape", () => {
    const raw = JSON.parse(readFileSync(join(fixturesDir, "01-login.json"), "utf8"));
    expect(raw.response.result[0]).toBe(1);
    expect(typeof raw.response.result[1]).toBe("string");
  });
});
