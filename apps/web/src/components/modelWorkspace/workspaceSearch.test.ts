import type { ActWindowDomainTab } from "@epiton/protocol";
import { describe, expect, it } from "vitest";
import { activeWorkspaceTabDomain, savedSearchText, workspaceListDomain } from "./workspaceSearch";

describe("workspaceSearch", () => {
  it("evaluates only the selected Tryton action-domain tab", () => {
    const tabs: ActWindowDomainTab[] = [
      {
        name: "Company",
        domain: [["company", "=", { __class__: "Eval", v: "company" }]],
      },
    ];

    expect(activeWorkspaceTabDomain(tabs, 0, { company: 4 })).toEqual([["company", "=", 4]]);
    expect(activeWorkspaceTabDomain(tabs, -1, { company: 4 })).toEqual([]);
    expect(activeWorkspaceTabDomain(tabs, 7, { company: 4 })).toEqual([]);
  });

  it("composes action, tab, and free-text domains without hiding any constraint", () => {
    expect(
      workspaceListDomain([["active", "=", true]], [["company", "=", 4]], "Ada", [
        "rec_name",
        "code",
      ]),
    ).toEqual([
      ["active", "=", true],
      ["company", "=", 4],
      ["OR", ["rec_name", "ilike", "%Ada%"], ["code", "ilike", "%Ada%"]],
    ]);
  });

  it("preserves JSON domains and stored string domains for saved-search replay", () => {
    expect(workspaceListDomain([], [], '[["id","=",12]]', ["rec_name"])).toEqual([["id", "=", 12]]);
    expect(savedSearchText([["id", "=", 12]])).toBe('[["id","=",12]]');
    expect(savedSearchText('[["active","=",true]]')).toBe('[["active","=",true]]');
    expect(savedSearchText(undefined)).toBe("[]");
  });
});
