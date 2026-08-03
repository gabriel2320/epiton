import type { EpitonClient, JsonObject } from "@epiton/protocol";
import { hydrateMany2OneRecNames, type RecordValues, type ViewField } from "@epiton/view-engine";
import {
  createScreen,
  isScreenReadyToSave,
  type ScreenState,
  screenTrytonTimestamps,
  screenValuesForSave,
  shouldApplyNewDefaults,
  withTrytonTimestampContext,
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

export interface RecordSnapshot {
  recordId: number;
  values: RecordValues;
}

/**
 * Read the committed Tryton snapshot, including the new optimistic-lock epoch.
 * The caller decides whether a late result still belongs to its active Screen.
 */
export async function readRecordSnapshot(
  client: RecordSaveClient,
  model: string,
  recordId: number,
  fields: readonly string[],
  fieldMeta: Record<string, ViewField>,
  context: JsonObject,
): Promise<RecordSnapshot | null> {
  const result = await client.model(model, "read", [[recordId], [...fields]], context);
  const values = Array.isArray(result) ? result[0] : null;
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const payloadId = Number((values as RecordValues).id);
  if (Number.isFinite(payloadId) && payloadId !== recordId) return null;
  return {
    recordId,
    values: hydrateMany2OneRecNames(values as RecordValues, Object.values(fieldMeta)),
  };
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
  const mutationContext = withTrytonTimestampContext(
    context,
    screenTrytonTimestamps(currentScreen),
  ) as JsonObject;
  if (selectedId) {
    await client.model(model, "write", [[selectedId], values], mutationContext);
    onHistory?.("write");
    return { id: selectedId, savedValues };
  }

  const created = await client.model(model, "create", [[values]], mutationContext);
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
