import { describe, expect, it } from "vitest";
import { applyBoardOrder, boardActionNames, parseBoardLayout } from "./board";
import { parseXml } from "./parse";

describe("board", () => {
  it("collects action names from board arch", () => {
    const root = parseXml(
      `<board><action name="act_party"/><group><action name="42"/></group></board>`,
    );
    expect(boardActionNames(root)).toEqual(["act_party", "42"]);
  });

  it("parses col/colspan layout", () => {
    const root = parseXml(
      `<board col="6"><action name="a" colspan="2" string="Parties"/><action name="b"/></board>`,
    );
    const layout = parseBoardLayout(root);
    expect(layout.col).toBe(6);
    expect(layout.tiles).toEqual([
      { id: "a", name: "a", string: "Parties", colspan: 2 },
      { id: "b", name: "b", string: undefined, colspan: 1 },
    ]);
  });

  it("reorders tiles by id list", () => {
    const layout = parseBoardLayout(
      parseXml(`<board><action name="a"/><action name="b"/><action name="c"/></board>`),
    );
    expect(applyBoardOrder(layout, ["c", "a"]).tiles.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });
});
