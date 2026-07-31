import { describe, expect, it } from "vitest";
import { buildSessionContext, viewIdForMode } from "./session_context";

describe("session_context", () => {
  it("merges preferences and overlay", () => {
    const ctx = buildSessionContext(
      { company: 3, language: "es", groups: [1, 2], context: { warehouse: 9 } },
      { active_id: 5 },
    );
    expect(ctx.company).toBe(3);
    expect(ctx.warehouse).toBe(9);
    expect(ctx.active_id).toBe(5);
    expect(ctx.language).toBe("es");
  });

  it("picks view id by mode", () => {
    expect(
      viewIdForMode(
        [
          [10, "tree"],
          [11, "form"],
          [null, "calendar"],
        ],
        "form",
      ),
    ).toBe(11);
    expect(viewIdForMode([[null, "tree"]], "tree")).toBeNull();
    expect(viewIdForMode(undefined, "form")).toBeNull();
  });
});
