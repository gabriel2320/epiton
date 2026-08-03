import { describe, expect, it } from "vitest";
import {
  buildSearchDomain,
  decodeDomainFilter,
  encodeDomainFilter,
  formatOrder,
  mergeDomains,
  parseDomainValue,
  parseSearchDomain,
  validateTrytonDomain,
} from "./search";

describe("search helpers", () => {
  it("builds OR ilike domain from free text", () => {
    expect(buildSearchDomain("acme")).toEqual([
      [
        "OR",
        ["rec_name", "ilike", "%acme%"],
        ["name", "ilike", "%acme%"],
        ["code", "ilike", "%acme%"],
      ],
    ]);
  });

  it("parses JSON domain and numeric id", () => {
    expect(buildSearchDomain('[["active", "=", true]]')).toEqual([["active", "=", true]]);
    expect(buildSearchDomain("42")).toEqual([["id", "=", 42]]);
  });

  it("rejects malformed raw domains instead of falling through to an RPC search", () => {
    expect(parseSearchDomain('[["active", "=", true]', ["name"])).toEqual({
      ok: false,
      error: "Raw domain must be valid JSON",
    });
    expect(parseSearchDomain('[["active", "contains", true]]', ["name"])).toEqual({
      ok: false,
      error: 'domain[0][1]: unsupported operator "contains"',
    });
    expect(() => buildSearchDomain("{'active': true}")).toThrow("Raw domain must be valid JSON");
  });

  it("validates operator-specific values and nested domain structure", () => {
    expect(validateTrytonDomain([["id", "in", [1, 2]]])).toEqual({ ok: true });
    expect(validateTrytonDomain(["OR", ["active", "=", true], ["name", "ilike", "%Ada%"]])).toEqual(
      { ok: true },
    );
    expect(validateTrytonDomain([["id", "in", 1]])).toEqual({
      ok: false,
      error: "domain[0][2]: in requires an array value",
    });
    expect(validateTrytonDomain([["addresses", "where", [["city", "=", "Santiago"]]]])).toEqual({
      ok: true,
    });
    expect(validateTrytonDomain(["id", "=", 1])).toEqual({
      ok: false,
      error: "domain: domain must contain clauses or start with AND/OR",
    });
  });

  it("round-trips flat typed AND/OR domains and preserves the optional target", () => {
    const filter = {
      combinator: "OR" as const,
      clauses: [
        { field: "active", operator: "=" as const, value: true },
        { field: "parent", operator: "child_of" as const, value: [3], target: "parent" },
      ],
    };
    const domain = encodeDomainFilter(filter);
    expect(domain).toEqual(["OR", ["active", "=", true], ["parent", "child_of", [3], "parent"]]);
    expect(decodeDomainFilter(domain)).toEqual(filter);
    expect(
      decodeDomainFilter([
        ["name", "=", "Ada"],
        ["active", "=", true],
      ]),
    ).toEqual({
      combinator: "AND",
      clauses: [
        { field: "name", operator: "=", value: "Ada" },
        { field: "active", operator: "=", value: true },
      ],
    });
  });

  it("keeps nested domains valid but in raw mode when the flat builder cannot represent them", () => {
    const nested = [
      ["company", "=", 4],
      ["OR", ["name", "=", "Ada"], ["code", "=", "A-1"]],
    ];
    expect(validateTrytonDomain(nested)).toEqual({ ok: true });
    expect(decodeDomainFilter(nested)).toBeNull();
    expect(parseSearchDomain(JSON.stringify(nested))).toEqual({
      ok: true,
      domain: nested,
      kind: "raw",
    });
  });

  it("coerces builder values from field and operator types", () => {
    expect(parseDomainValue("true", "boolean", "=")).toEqual({ ok: true, value: true });
    expect(parseDomainValue("12.5", "numeric", ">=")).toEqual({ ok: true, value: 12.5 });
    expect(parseDomainValue('["draft","done"]', "selection", "in")).toEqual({
      ok: true,
      value: ["draft", "done"],
    });
    expect(parseDomainValue("1", "selection", "=")).toEqual({ ok: true, value: 1 });
    expect(parseDomainValue('"1"', "selection", "=")).toEqual({ ok: true, value: "1" });
    expect(parseDomainValue("yes", "boolean", "=")).toEqual({
      ok: false,
      error: "Boolean value must be true, false, or null",
    });
  });

  it("merges domains and formats order", () => {
    expect(mergeDomains([["a", "=", 1]], [["b", "=", 2]])).toEqual([
      ["a", "=", 1],
      ["b", "=", 2],
    ]);
    expect(
      formatOrder([
        { id: "name", desc: false },
        { id: "id", desc: true },
      ]),
    ).toBe("name ASC, id DESC");
  });
});
