import { describe, expect, it } from "vitest";
import { buildSessionContext } from "./session_context";

describe("preferences helpers", () => {
  it("buildSessionContext still merges after preference-shaped patch", () => {
    const ctx = buildSessionContext({ company: 1, language: "en" }, { user: 7 });
    expect(ctx.company).toBe(1);
    expect(ctx.user).toBe(7);
  });
});
