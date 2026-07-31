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
 */
export interface ScreenState {
  model: string;
  recordId: number | null;
  values: RecordValues;
  baseline: RecordValues;
  relationQueues: Record<string, RelationCommandQueue>;
}

export function createScreen(
  model: string,
  recordId: number | null,
  values: RecordValues = {},
): ScreenState {
  const snapshot = { ...values };
  return {
    model,
    recordId,
    values: snapshot,
    baseline: { ...snapshot },
    relationQueues: {},
  };
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
