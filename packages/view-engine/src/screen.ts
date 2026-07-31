import type { ViewField } from "./parse";
import type { O2MCommand } from "./relations";
import { isTrytonRelationCommands, toTrytonM2M, toTrytonM2MDelta, toTrytonO2M } from "./relations";
import type { RecordValues } from "./render";

export type RelationFieldKind = "one2many" | "many2many";

/** Parent-owned relation edits that have not been written to trytond yet. */
export interface RelationCommandQueue {
  kind: RelationFieldKind;
  /** Server ids currently kept by the editor. Pending creates have no id yet. */
  ids: number[];
  /** Ids loaded from trytond, or last explicitly attached to the draft. */
  baselineIds: number[];
  /** Ordered Tryton operations. Order is significant and is never compacted here. */
  commands: O2MCommand[];
}

/**
 * Minimal client Screen lifecycle. It owns only an editable snapshot and pending
 * relation commands; trytond remains the sole business-data authority.
 *
 * `hydrated` is the explicit lifecycle marker: new drafts are ready immediately;
 * an existing selection stays unready until hydrate (never inferred from values.id).
 */
export interface ScreenState {
  model: string;
  recordId: number | null;
  /** True once a new draft exists or an existing selection has applied a server snapshot. */
  hydrated: boolean;
  values: RecordValues;
  baseline: RecordValues;
  relationQueues: Record<string, RelationCommandQueue>;
}

/**
 * Create a Screen. Omitting `values` for an existing recordId marks the Screen
 * as not yet hydrated (selection placeholder). Passing `values` (even `{}`)
 * means the host already has a snapshot and the Screen is ready.
 */
export function createScreen(
  model: string,
  recordId: number | null,
  values?: RecordValues,
): ScreenState {
  const hasSnapshot = values !== undefined;
  const snapshot = { ...(values ?? {}) };
  return {
    model,
    recordId,
    hydrated: recordId == null || hasSnapshot,
    values: snapshot,
    baseline: { ...snapshot },
    relationQueues: {},
  };
}

/** Switch record identity immediately so values and relation queues cannot leak across records. */
export function screenForSelection(
  screen: ScreenState,
  model: string,
  recordId: number | null,
): ScreenState {
  if (screen.model === model && screen.recordId === recordId) return screen;
  return createScreen(model, recordId);
}

/**
 * Accept a server snapshot unless it would overwrite unsaved edits for the
 * same record. A different record identity always starts a fresh Screen.
 */
export function hydrateScreenFromRecord(
  screen: ScreenState,
  model: string,
  recordId: number | null,
  values: RecordValues,
): ScreenState {
  const sameRecord = screen.model === model && screen.recordId === recordId;
  if (sameRecord && screenIsDirty(screen)) return screen;
  const hydrated = createScreen(model, recordId, values);
  if (!sameRecord) return hydrated;
  for (const [fieldName, queue] of Object.entries(screen.relationQueues)) {
    hydrated.relationQueues[fieldName] = createRelationQueue(queue.kind, values[fieldName]);
  }
  return hydrated;
}

/** Hydrate only the record currently selected by the host; stale query results are ignored. */
export function hydrateSelectedScreen(
  screen: ScreenState,
  model: string,
  selectedId: number | null,
  requestedId: number,
  values: RecordValues,
): ScreenState {
  if (selectedId == null || requestedId !== selectedId) return screen;
  const rawId = Number(values.id);
  // The request envelope is authoritative; a payload id, when present, must agree.
  if (Number.isFinite(rawId) && rawId !== requestedId) return screen;
  return hydrateScreenFromRecord(screen, model, selectedId, values);
}

/** True when a new draft is ready, or an existing selection has hydrated. */
export function isScreenReadyToSave(screen: ScreenState, selectedId: number | null): boolean {
  if (selectedId == null) return screen.recordId == null && screen.hydrated;
  return screen.recordId === selectedId && screen.hydrated;
}

/** Drop async Screen patches whose generation/identity no longer matches. */
export function acceptAsyncScreenUpdate(
  expected: { generation: number; model: string; recordId: number | null },
  current: { generation: number; model: string; recordId: number | null },
): boolean {
  return (
    expected.generation === current.generation &&
    expected.model === current.model &&
    expected.recordId === current.recordId
  );
}

/**
 * Late `default_get` may apply only while the new Screen is still pristine.
 * Identity/generation must still match; a user edit wins over delayed defaults.
 */
export function shouldApplyNewDefaults(
  expected: { generation: number; model: string; recordId: number | null },
  current: { generation: number; model: string; recordId: number | null },
  screen: ScreenState,
): boolean {
  if (!acceptAsyncScreenUpdate(expected, current)) return false;
  if (screen.recordId != null) return false;
  return !screenIsDirty(screen);
}

export function updateScreenValues(screen: ScreenState, values: RecordValues): ScreenState {
  return { ...screen, values };
}

export function setScreenRelationQueue(
  screen: ScreenState,
  fieldName: string,
  queue: RelationCommandQueue,
): ScreenState {
  return {
    ...screen,
    relationQueues: {
      ...screen.relationQueues,
      [fieldName]: {
        ...queue,
        ids: [...queue.ids],
        baselineIds: [...queue.baselineIds],
        commands: [...queue.commands],
      },
    },
  };
}

export function idsFromRelationValue(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  if (isTrytonRelationCommands(value)) {
    const ids: number[] = [];
    const removed = new Set<number>();
    for (const command of value) {
      if (!Array.isArray(command) || typeof command[0] !== "string") continue;
      const op = command[0];
      if (op === "add" || op === "write") {
        if (!Array.isArray(command[1])) continue;
        for (const rawId of command[1]) {
          const id = Number(rawId);
          if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
        }
      } else if (op === "remove" || op === "delete") {
        if (!Array.isArray(command[1])) continue;
        for (const rawId of command[1]) {
          const id = Number(rawId);
          if (Number.isFinite(id)) removed.add(id);
        }
      }
    }
    return ids.filter((id) => !removed.has(id));
  }

  const ids: number[] = [];
  for (const item of value) {
    let id = Number.NaN;
    if (typeof item === "number") id = item;
    else if (Array.isArray(item) && typeof item[0] === "number") id = item[0];
    else if (item && typeof item === "object" && "id" in item) {
      id = Number((item as { id: unknown }).id);
    }
    if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function createRelationQueue(kind: RelationFieldKind, value: unknown): RelationCommandQueue {
  const ids = idsFromRelationValue(value);
  return { kind, ids, baselineIds: [...ids], commands: [] };
}

export function relationQueueHasChanges(queue: RelationCommandQueue): boolean {
  if (queue.commands.length > 0) return true;
  if (queue.ids.length !== queue.baselineIds.length) return true;
  return queue.ids.some((id, index) => id !== queue.baselineIds[index]);
}

export function relationQueueWireValue(queue: RelationCommandQueue): unknown[] {
  if (queue.kind === "many2many") {
    // M2M ids are authoritative; commands only preserve editor intent/dirty state.
    return toTrytonM2MDelta(queue.baselineIds, queue.ids);
  }
  let commands = queue.commands;
  if (!commands.length) {
    if (relationQueueHasChanges(queue)) {
      const previous = new Set(queue.baselineIds);
      const next = new Set(queue.ids);
      commands = [
        ...queue.ids.filter((id) => !previous.has(id)).map((id): O2MCommand => ({ op: "add", id })),
        ...queue.baselineIds
          .filter((id) => !next.has(id))
          .map((id): O2MCommand => ({ op: "remove", id })),
      ];
    } else {
      commands = queue.ids.map((id): O2MCommand => ({ op: "add", id }));
    }
  }
  return toTrytonO2M(commands);
}

export function screenIsDirty(screen: ScreenState): boolean {
  if (serialize(screen.values) !== serialize(screen.baseline)) return true;
  return Object.values(screen.relationQueues).some(relationQueueHasChanges);
}

/** Encode an editable Screen into the existing Tryton create/write values shape. */
export function screenValuesForSave(
  screen: ScreenState,
  fieldMeta: Record<string, ViewField>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, meta] of Object.entries(fieldMeta)) {
    if (meta.readonly) continue;
    const queue = screen.relationQueues[key];

    if (queue && queue.kind === meta.type && relationQueueHasChanges(queue)) {
      values[key] = relationQueueWireValue(queue);
      continue;
    }
    if (!(key in screen.values)) continue;
    const raw = screen.values[key];

    if (meta.type === "boolean") {
      values[key] = Boolean(raw);
    } else if (raw == null || raw === "") {
      values[key] = null;
    } else if (meta.type === "many2one") {
      values[key] = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    } else if (meta.type === "many2many") {
      values[key] = isTrytonRelationCommands(raw) ? raw : toTrytonM2M(idsFromRelationValue(raw));
    } else if (meta.type === "one2many") {
      values[key] = isTrytonRelationCommands(raw)
        ? raw
        : idsFromRelationValue(raw).map((id) => ["add", [id]]);
    } else if (
      meta.type === "reference" ||
      meta.type === "dict" ||
      meta.type === "multiselection"
    ) {
      values[key] = raw;
    } else if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "string") {
      values[key] = raw;
    }
  }
  return values;
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
