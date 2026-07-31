import { describe, expect, it } from "vitest";
import { boardActionNames } from "./board";
import { parseXml } from "./parse";

describe("board", () => {
  it("collects action names from board arch", () => {
    const root = parseXml(
      `<board><action name="act_party"/><group><action name="42"/></group></board>`,
    );
    expect(boardActionNames(root)).toEqual(["act_party", "42"]);
  });
});
