import { describe, expect, it } from "vitest";
import { buildSearchDomain, formatOrder, mergeDomains } from "./search";

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
