export type WorkspaceListViewMode = "tree" | "list-form" | "calendar" | "graph";

export type WorkspaceHost = "model" | "board";

/** Whether the ordered Tryton action explicitly exposes a given view mode. */
export function actionHasViewMode(
  views: Array<[number | null, string]> | undefined,
  mode: string,
): boolean {
  return views?.some(([, viewMode]) => viewMode === mode) ?? false;
}

/**
 * Honor the first Tryton action view when Epiton has a dedicated list host for it.
 * Form-only and unknown future view kinds stay on the generic model workspace.
 */
export function initialWorkspaceViewMode(
  views?: Array<[number | null, string]>,
): WorkspaceListViewMode {
  const firstView = views?.[0]?.[1];
  switch (firstView) {
    case "list-form":
    case "calendar":
    case "graph":
      return firstView;
    default:
      return "tree";
  }
}

/** Route ordered Tryton board actions to the board host; all other views stay generic. */
export function workspaceHostForViews(views?: Array<[number | null, string]>): WorkspaceHost {
  if (!views?.length) return "model";
  return views[0]?.[1] === "board" || views.every(([, mode]) => mode === "board")
    ? "board"
    : "model";
}
