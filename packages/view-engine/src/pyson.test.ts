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
      evalPysonNode({ __class__: "In", k: "a", v: { __class__: "Eval", v: "tags" } }, ctx),
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

  it("resolves decoded fields_view_get states", () => {
    const states = resolveStatesAttr(
      {
        readonly: {
          __class__: "Not",
          v: {
            __class__: "equal",
            s1: { __class__: "Eval", v: "state" },
            s2: "draft",
          },
        },
      },
      { state: "done" },
    );
    expect(states.readonly).toBe(true);
  });

  it("keeps string Eval/Not fallback", () => {
    expect(evalPyson("Eval('active')", { active: 1 })).toBe(true);
    expect(evalPyson("Not(Eval('active'))", { active: false })).toBe(true);
    expect(evalPyson("And(Eval('a'), Eval('b'))", { a: true, b: true })).toBe(true);
  });

  it("evaluates nested Get on _actions (board cross-filter)", () => {
    const ctx = {
      _actions: {
        "party.act_party": { active_id: 42, active_ids: [42], active_model: "party.party" },
      },
    };
    const activeId = evalPysonNode(
      {
        __class__: "Get",
        v: {
          __class__: "Get",
          v: { __class__: "Eval", v: "_actions", d: {} },
          k: "party.act_party",
          d: {},
        },
        k: "active_id",
        d: null,
      },
      ctx,
    );
    expect(activeId).toBe(42);
    const domain = evalDomain(
      [
        [
          "party",
          "=",
          {
            __class__: "Get",
            v: {
              __class__: "Get",
              v: { __class__: "Eval", v: "_actions", d: {} },
              k: "party.act_party",
              d: {},
            },
            k: "active_id",
            d: null,
          },
        ],
      ],
      ctx,
    );
    expect(domain).toEqual([["party", "=", 42]]);
  });

  it("evaluates Add / Sub / Mul / Div / Id", () => {
    expect(
      evalPysonNode(
        {
          __class__: "Add",
          s1: { __class__: "Eval", v: "qty" },
          s2: 3,
        },
        { qty: 2 },
      ),
    ).toBe(5);
    expect(evalPysonNode({ __class__: "Sub", s1: 10, s2: 4 }, {})).toBe(6);
    expect(evalPysonNode({ __class__: "Mul", s1: 3, s2: 4 }, {})).toBe(12);
    expect(evalPysonNode({ __class__: "Div", s1: 10, s2: 4 }, {})).toBe(2.5);
    expect(evalPysonNode({ __class__: "Div", s1: 10, s2: 0 }, {})).toBeNull();
    expect(evalPysonNode({ __class__: "Id", d: 42 }, {})).toBe(42);
    expect(evalPysonNode({ __class__: "Id", module: "party", xml_id: "x" }, {})).toBeNull();
  });
});
