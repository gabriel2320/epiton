import { toTrytonM2M, toTrytonM2MDelta, toTrytonO2M } from "@epiton/view-engine";
import { describe, expect, it } from "vitest";

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

  it("encodes m2m deltas as add/remove", () => {
    expect(toTrytonM2MDelta([1, 2, 3], [2, 3, 4])).toEqual([
      ["add", [4]],
      ["remove", [1]],
    ]);
    expect(toTrytonM2MDelta([1], [1])).toEqual([["add", [1]]]);
  });
});
