import { type ScreenState, screenForSelection } from "../../lib/screen";

export interface ListSelectionTransition {
  nextId: number | null;
  changed: boolean;
  confirmDiscard: boolean;
  resetScreen: boolean;
}

/** Describe selection side effects without touching React or the Screen lifecycle. */
export function listSelectionTransition(
  currentId: number | null,
  nextId: number | null,
  committed = false,
): ListSelectionTransition {
  const changed = currentId !== nextId;
  const resetScreen = changed && !committed;
  return {
    nextId,
    changed,
    confirmDiscard: resetScreen,
    resetScreen,
  };
}

/** Clear record-local state when an uncommitted selection changes identity. */
export function screenAfterListSelection(
  current: ScreenState,
  model: string,
  transition: ListSelectionTransition,
): ScreenState {
  return transition.resetScreen ? screenForSelection(current, model, transition.nextId) : current;
}

/** Prefer explicit multi-selection, then the focused row, for bulk contexts. */
export function effectiveSelectedIds(
  selectedIds: readonly number[],
  selectedId: number | null,
): number[] {
  if (selectedIds.length > 0) return [...selectedIds];
  return selectedId == null ? [] : [selectedId];
}

/** Toggle one row while preserving the order in which rows were selected. */
export function toggleSelectedId(selectedIds: readonly number[], id: number): number[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((selectedId) => selectedId !== id)
    : [...selectedIds, id];
}

/** Resolve the next focused id from the visible list, clamped at both ends. */
export function adjacentSelectedId(
  rows: readonly Record<string, unknown>[],
  selectedId: number | null,
  delta: -1 | 1,
): number | null {
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return null;

  const currentIndex = selectedId == null ? -1 : ids.indexOf(selectedId);
  const nextIndex =
    currentIndex < 0
      ? delta > 0
        ? 0
        : ids.length - 1
      : Math.min(ids.length - 1, Math.max(0, currentIndex + delta));
  const nextId = ids[nextIndex];
  return nextId == null || nextId === selectedId ? null : nextId;
}
