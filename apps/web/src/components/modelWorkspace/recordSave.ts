import type { EpitonClient, JsonObject } from "@epiton/protocol";
import type { RecordValues, ViewField } from "@epiton/view-engine";
import {
  type ScreenState,
  createScreen,
  isScreenReadyToSave,
  screenValuesForSave,
  shouldApplyNewDefaults,
} from "../../lib/screen";

type RecordSaveClient = Pick<EpitonClient, "model">;

export interface ScreenIdentity {
  generation: number;
  model: string;
  recordId: number | null;
}

export interface SaveRecordOptions {
  client: RecordSaveClient;
  model: string;
  selectedId: number | null;
  fieldMeta: Record<string, ViewField>;
  context: JsonObject;
  getGeneration: () => number;
  getScreen: () => ScreenState;
  flushPendingOnChange: () => Promise<void>;
  bumpScreenGeneration: () => void;
  onHistory?: (action: string) => void;
}

export interface SavedRecord {
  id: number;
  savedValues: RecordValues;
}

/** Apply a delayed default_get result only while the same new Screen is pristine. */
export function screenAfterNewDefaults(
  expected: ScreenIdentity,
  currentGeneration: number,
  current: ScreenState,
  defaults?: RecordValues,
): ScreenState {
  if (
    !shouldApplyNewDefaults(
      expected,
      {
        generation: currentGeneration,
        model: current.model,
        recordId: current.recordId,
      },
      current,
    )
  ) {
    return current;
  }
  return createScreen(expected.model, null, defaults);
}

/**
 * Flush on_change and freeze one ready Screen snapshot before crossing the
 * Tryton create/write boundary.
 */
export async function saveRecord(options: SaveRecordOptions): Promise<SavedRecord> {
  const {
    client,
    model,
    selectedId,
    fieldMeta,
    context,
    getGeneration,
    getScreen,
    flushPendingOnChange,
    bumpScreenGeneration,
    onHistory,
  } = options;
  const expectedGeneration = getGeneration();
  await flushPendingOnChange();
  if (getGeneration() !== expectedGeneration) {
    throw new Error("Save cancelled because the Screen changed");
  }

  const currentScreen = getScreen();
  if (!isScreenReadyToSave(currentScreen, selectedId)) {
    throw new Error(
      selectedId == null ? "New record Screen is not ready" : "Selected record is still loading",
    );
  }

  // The save snapshot is complete; retire its generation before the write.
  bumpScreenGeneration();
  const values = screenValuesForSave(currentScreen, fieldMeta) as JsonObject;
  const savedValues = currentScreen.values;
  if (selectedId) {
    await client.model(model, "write", [[selectedId], values], context);
    onHistory?.("write");
    return { id: selectedId, savedValues };
  }

  const created = await client.model(model, "create", [[values]], context);
  const id = Array.isArray(created) ? Number(created[0]) : Number(created);
  onHistory?.("create");
  return { id, savedValues };
}

/** Rebuild the last server snapshot when abandoning local edits. */
export function screenAfterDiscard(
  model: string,
  selectedId: number | null,
  values?: RecordValues,
): ScreenState | null {
  return values === undefined ? null : createScreen(model, selectedId, values);
}

/** Describe the side effects needed to leave write mode without mutating React state. */
export function leaveWriteModeTransition(mode: "read" | "write"): {
  mode: "read";
  bumpGeneration: boolean;
} {
  return { mode: "read", bumpGeneration: mode === "write" };
}
