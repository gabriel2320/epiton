import { describe, expect, it } from "vitest";
import {
  adaptiveLayout,
  strictAclCoach,
  suggestNextActions,
  unifiedSearch,
  workspaceFavorites,
} from "./index";

describe("intelligence", () => {
  it("ranks unified search hits", () => {
    const hits = unifiedSearch(
      "party",
      [{ id: 1, name: "Parties", keywords: ["party", "contact"] }],
      [{ model: "party.party", id: 9, title: "Acme Party", at: Date.now() }],
    );
    expect(hits[0]?.label).toMatch(/Party|Parties/i);
  });

  it("suggests frequent actions", () => {
    const suggestions = suggestNextActions([
      { model: "party.party", action: "create" },
      { model: "party.party", action: "create" },
      { model: "sale.sale", action: "confirm" },
    ]);
    expect(suggestions[0]?.payload.action).toBe("create");
  });

  it("adapts layout by viewport and preset", () => {
    expect(adaptiveLayout({ viewportWidth: 480, preset: "general", preferTree: true }).layout).toBe(
      "cards",
    );
    expect(
      adaptiveLayout({ viewportWidth: 1400, preset: "warehouse", preferTree: false }).density,
    ).toBe("compact");
  });

  it("coaches missing ACL", () => {
    expect(strictAclCoach("x.y", false)?.severity).toBe("warn");
    expect(strictAclCoach("x.y", true)).toBeNull();
  });

  it("returns clinical favorites", () => {
    expect(workspaceFavorites("clinical")).toContain("gnuhealth.patient");
  });
});
