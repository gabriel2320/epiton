import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toTrytonM2M, toTrytonO2M } from "@epiton/view-engine";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

describe("relation commands", () => {
  it("encodes o2m/m2m tryton commands", () => {
    expect(
      toTrytonO2M([
        { op: "add", id: 3 },
        { op: "delete", id: 9 },
      ]),
    ).toEqual([
      ["add", [3]],
      ["delete", [9]],
    ]);
    expect(toTrytonM2M([1, 2])).toEqual([["add", [1, 2]]]);
  });

  it("keeps login fixture stable", () => {
    const raw = JSON.parse(readFileSync(join(dir, "fixtures/01-login.json"), "utf8")) as {
      response: { result: unknown[] };
    };
    expect(raw.response.result).toHaveLength(2);
  });
});
