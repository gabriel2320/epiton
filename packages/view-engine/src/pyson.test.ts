import { describe, expect, it } from "vitest";
import { evalDomain, evalPyson, evalPysonNode, resolveStatesAttr } from "./pyson";

describe("pyson JSON __class__", () => {
  it("evaluates Eval / Not / And / Or / If", () => {
    const ctx = { active: true, state: "draft", qty: 2 };
    expect(evalPysonNode({ __class__: "Eval", v: "active", d: false }, ctx)).toBe(true);
    expect(evalPysonNode({ __class__: "Not", v: { __class__: "Eval", v: "active" } }, ctx)).toBe(
      false,
    );
    expect(
      evalPysonNode(
        {
          __class__: "And",
          s: [
            { __class__: "Eval", v: "active" },
            { __class__: "equal", s1: { __class__: "Eval", v: "state" }, s2: "draft" },
          ],
        },
        ctx,
      ),
    ).toBe(true);
    expect(
      evalPysonNode(
        {
          __class__: "If",
          c: { __class__: "Eval", v: "active" },
          t: true,
          e: false,
        },
        ctx,
      ),
    ).toBe(true);
  });

  it("evaluates Get / In / Date / Len", () => {
    const ctx = { meta: { code: "X" }, tags: ["a", "b"] };
    expect(
      evalPysonNode(
        { __class__: "Get", v: { __class__: "Eval", v: "meta" }, k: "code", d: null },
        ctx,
      ),
    ).toBe("X");
    expect(
      evalPysonNode({ __class__: "In", v: "a", k: { __class__: "Eval", v: "tags" } }, ctx),
    ).toBe(true);
    expect(String(evalPysonNode({ __class__: "Date", y: 2024, M: 1, d: 2 }, {}))).toBe(
      "2024-01-02",
    );
    expect(evalPysonNode({ __class__: "Len", v: { __class__: "Eval", v: "tags" } }, ctx)).toBe(2);
  });

  it("evaluates domains with Eval", () => {
    const domain = evalDomain([["company", "=", { __class__: "Eval", v: "company", d: null }]], {
      company: 7,
    });
    expect(domain).toEqual([["company", "=", 7]]);
  });

  it("resolves states from JSON dict", () => {
    const states = resolveStatesAttr(
      JSON.stringify({
        invisible: { __class__: "Not", v: { __class__: "Eval", v: "active", d: true } },
        readonly: { __class__: "Eval", v: "locked", d: false },
      }),
      { active: true, locked: false },
    );
    expect(states.invisible).toBe(false);
    expect(states.readonly).toBe(false);
  });

  it("keeps string Eval/Not fallback", () => {
    expect(evalPyson("Eval('active')", { active: 1 })).toBe(true);
    expect(evalPyson("Not(Eval('active'))", { active: false })).toBe(true);
    expect(evalPyson("And(Eval('a'), Eval('b'))", { a: true, b: true })).toBe(true);
  });
});
