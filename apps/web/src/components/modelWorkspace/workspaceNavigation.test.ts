import { describe, expect, it } from "vitest";
import { initialWorkspaceViewMode, workspaceHostForViews } from "./workspaceNavigation";

describe("workspaceNavigation", () => {
  it("starts on the first supported Tryton list view", () => {
    expect(initialWorkspaceViewMode([[3, "calendar"]])).toBe("calendar");
    expect(initialWorkspaceViewMode([[4, "graph"]])).toBe("graph");
    expect(initialWorkspaceViewMode([[5, "list-form"]])).toBe("list-form");
    expect(initialWorkspaceViewMode([[6, "tree"]])).toBe("tree");
  });

  it("keeps form-only, absent, and unknown future views on the generic tree projection", () => {
    expect(initialWorkspaceViewMode([[7, "form"]])).toBe("tree");
    expect(initialWorkspaceViewMode([[8, "future-view"]])).toBe("tree");
    expect(initialWorkspaceViewMode()).toBe("tree");
  });

  it("routes only ordered board-first actions to the board host", () => {
    expect(workspaceHostForViews([[9, "board"]])).toBe("board");
    expect(
      workspaceHostForViews([
        [9, "board"],
        [10, "tree"],
      ]),
    ).toBe("board");
    expect(
      workspaceHostForViews([
        [10, "tree"],
        [9, "board"],
      ]),
    ).toBe("model");
    expect(workspaceHostForViews()).toBe("model");
  });
});
