import { describe, expect, it } from "vitest";
import { wizardActionRefs } from "./wizard_actions";

describe("wizardActionRefs", () => {
  it("normalizes common Tryton action payloads", () => {
    expect(
      wizardActionRefs([
        [{ type: "ir.action.act_window", id: 12 }, {}],
        [4, {}],
        "party.party",
        { type: "ir.action.wizard", id: 9 },
      ]),
    ).toEqual([
      "ir.action.act_window,12",
      "ir.action.act_window,4",
      "party.party",
      "ir.action.wizard,9",
    ]);
  });
});
