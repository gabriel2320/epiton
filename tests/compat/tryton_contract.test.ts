import { openActionUrl, sessionAuthorization } from "@epiton/protocol";
import {
  aggregateGraphData,
  applyBoardOrder,
  evalPyson,
  parseBoardLayout,
  parseGraphArch,
  parseXml,
  summarizeSeries,
  toTrytonM2M,
  toTrytonO2M,
} from "@epiton/view-engine";
import { describe, expect, it } from "vitest";

/**
 * Offline contract checks: Epitón helpers must match Tryton/Sao wire shapes
 * without requiring a live server.
 */
describe("tryton contract shapes (offline)", () => {
  it("builds Session Authorization header like Sao", () => {
    const header = sessionAuthorization({
      login: "admin",
      userId: 1,
      session: "tok",
    });
    // base64("admin:1:tok")
    expect(header).toMatch(/^Session /);
    const payload = Buffer.from(header.slice("Session ".length), "base64").toString("utf8");
    expect(payload).toBe("admin:1:tok");
  });

  it("blocks javascript: URL actions", () => {
    expect(openActionUrl("javascript:alert(1)")).toBe(false);
    expect(openActionUrl("")).toBe(false);
    // Node has no window.open — returns false; browsers return true for https.
    expect(typeof openActionUrl("https://example.com/path")).toBe("boolean");
  });

  it("encodes O2M/M2M commands Tryton expects", () => {
    expect(toTrytonO2M([{ op: "create", values: { name: "L" } }])[0]?.[0]).toBe("create");
    expect(toTrytonM2M([4, 5])).toEqual([["add", [4, 5]]]);
  });

  it("evaluates PYSON Eval like view states", () => {
    expect(evalPyson("Eval('active')", { active: true })).toBe(true);
    expect(evalPyson("Not(Eval('active'))", { active: true })).toBe(false);
    expect(
      evalPyson(JSON.stringify({ __class__: "Eval", v: "active", d: false }), { active: true }),
    ).toBe(true);
  });

  it("parses board and graph arch like Tryton XML", () => {
    const board = parseBoardLayout(
      parseXml(`<board col="4"><action name="act_party" colspan="2"/></board>`),
    );
    expect(board.tiles[0]?.name).toBe("act_party");
    expect(applyBoardOrder(board, ["act_party"]).tiles).toHaveLength(1);

    const graph = parseGraphArch(
      parseXml(`<graph type="line"><x><field name="name"/></x><y><field name="id"/></y></graph>`),
    );
    expect(graph?.type).toBe("line");
    const data = aggregateGraphData(
      [
        { name: "A", id: 2 },
        { name: "A", id: 3 },
      ],
      "name",
      "id",
    );
    expect(summarizeSeries(data).sum).toBe(5);
  });
});
