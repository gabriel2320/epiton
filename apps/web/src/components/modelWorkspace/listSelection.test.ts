import { describe, expect, it } from "vitest";
import { createScreen, screenIsDirty, updateScreenValues } from "../../lib/screen";
import {
  adjacentSelectedId,
  effectiveSelectedIds,
  externalSelectionNeedsSync,
  listSelectionTransition,
  screenAfterListSelection,
  toggleSelectedId,
} from "./listSelection";

describe("listSelection", () => {
  it("describes only uncommitted identity changes as discard and Screen resets", () => {
    expect(listSelectionTransition(7, 9)).toEqual({
      nextId: 9,
      changed: true,
      confirmDiscard: true,
      resetScreen: true,
    });
    expect(listSelectionTransition(7, 7)).toEqual({
      nextId: 7,
      changed: false,
      confirmDiscard: false,
      resetScreen: false,
    });
    expect(listSelectionTransition(7, 9, true)).toEqual({
      nextId: 9,
      changed: true,
      confirmDiscard: false,
      resetScreen: false,
    });
  });

  it("drops dirty record-local state before an uncommitted A-to-B selection", () => {
    const dirtyA = updateScreenValues(createScreen("party.party", 7, { name: "A" }), {
      name: "edited",
    });
    const moved = screenAfterListSelection(dirtyA, "party.party", listSelectionTransition(7, 9));

    expect(moved).toEqual(createScreen("party.party", 9));
    expect(moved.hydrated).toBe(false);
    expect(screenIsDirty(moved)).toBe(false);
    expect(
      screenAfterListSelection(dirtyA, "party.party", listSelectionTransition(7, 9, true)),
    ).toBe(dirtyA);
  });

  it("treats an identical controlled-selection echo as a no-op", () => {
    const current = createScreen("party.party", 7, { name: "Autoritativo" });

    expect(externalSelectionNeedsSync(current, 7, "party.party", 7)).toBe(false);
    expect(externalSelectionNeedsSync(current, null, "party.party", 7)).toBe(true);
    expect(externalSelectionNeedsSync(current, 7, "party.party", 8)).toBe(true);
    expect(externalSelectionNeedsSync(current, 7, "gnuhealth.patient", 7)).toBe(true);
  });

  it("resolves adjacent ids from visible rows and clamps list boundaries", () => {
    const rows = [{ id: 3 }, { id: "5" }, { id: "invalid" }, {}, { id: 8 }];

    expect(adjacentSelectedId(rows, null, 1)).toBe(3);
    expect(adjacentSelectedId(rows, null, -1)).toBe(8);
    expect(adjacentSelectedId(rows, 3, 1)).toBe(5);
    expect(adjacentSelectedId(rows, 8, -1)).toBe(5);
    expect(adjacentSelectedId(rows, 3, -1)).toBeNull();
    expect(adjacentSelectedId(rows, 8, 1)).toBeNull();
    expect(adjacentSelectedId([], 3, 1)).toBeNull();
  });

  it("prefers multi-selection and otherwise falls back to the focused id", () => {
    const multi = [4, 6];
    const resolved = effectiveSelectedIds(multi, 9);

    expect(resolved).toEqual([4, 6]);
    expect(resolved).not.toBe(multi);
    expect(effectiveSelectedIds([], 9)).toEqual([9]);
    expect(effectiveSelectedIds([], null)).toEqual([]);
  });

  it("toggles membership without mutating or reordering the remaining ids", () => {
    const selected = [2, 4, 6];

    expect(toggleSelectedId(selected, 4)).toEqual([2, 6]);
    expect(toggleSelectedId(selected, 8)).toEqual([2, 4, 6, 8]);
    expect(selected).toEqual([2, 4, 6]);
  });
});
