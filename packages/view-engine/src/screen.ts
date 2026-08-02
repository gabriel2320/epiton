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
 * Extends the identity guard with request ordering for async work on the same
 * Screen. Only the newest revision may publish a patch, error, or busy-state end.
 */
export function acceptLatestAsyncScreenUpdate(
  expected: { generation: number; model: string; recordId: number | null; revision: number },
  current: { generation: number; model: string; recordId: number | null; revision: number },
): boolean {
  return expected.revision === current.revision && acceptAsyncScreenUpdate(expected, current);
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
    // Membership is normalized from ids, while nested record mutations retain
    // their explicit order. A delete already implies unlink, so do not emit a
    // duplicate remove for that id.
    const nested = queue.commands.filter(
      (command) => command.op === "create" || command.op === "write" || command.op === "delete",
    );
    if (!nested.length) return toTrytonM2MDelta(queue.baselineIds, queue.ids);
    const deleted = new Set(
      nested.filter((command) => command.op === "delete").map((command) => command.id),
    );
    const previous = new Set(queue.baselineIds);
    const next = new Set(queue.ids);
    const membership: O2MCommand[] = [
      ...queue.ids.filter((id) => !previous.has(id)).map((id): O2MCommand => ({ op: "add", id })),
      ...queue.baselineIds
        .filter((id) => !next.has(id) && !deleted.has(id))
        .map((id): O2MCommand => ({ op: "remove", id })),
    ];
    return toTrytonO2M([...nested, ...membership]);
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

/**
 * Encode the live relation snapshot used by Tryton on_change methods.
 * This is deliberately different from relationQueueWireValue: O2M uses child
 * dictionaries and M2M uses ids, while parent persistence uses command tuples.
 */
export function relationQueueOnChangeValue(queue: RelationCommandQueue): unknown[] {
  if (queue.kind === "many2many") return [...queue.ids];

  const rows = new Map<number, Record<string, unknown>>();
  for (const id of queue.ids) rows.set(id, { id });
  const creates: Array<Record<string, unknown>> = [];

  for (let commandIndex = 0; commandIndex < queue.commands.length; commandIndex += 1) {
    const command = queue.commands[commandIndex];
    if (!command) continue;
    if (command.op === "create") {
      creates.push({ ...command.values, id: -(commandIndex + 1) });
    } else if (command.op === "write") {
      if (rows.has(command.id))
        rows.set(command.id, { ...rows.get(command.id), ...command.values, id: command.id });
    } else if (command.op === "add") {
      if (!rows.has(command.id)) rows.set(command.id, { id: command.id });
    } else if (command.op === "remove" || command.op === "delete") {
      rows.delete(command.id);
    }
  }

  const persisted = queue.ids.flatMap((id) => {
    const row = rows.get(id);
    return row ? [row] : [];
  });
  return [...persisted, ...creates];
}

/** Encode a Screen for on_change/pre_validate without leaking write tuples. */
export function screenValuesForOnChange(
  screen: ScreenState,
  fieldMeta: Readonly<Record<string, ViewField>>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {
    id: screen.recordId ?? numericId(screen.values.id) ?? -1,
  };
  for (const [name, meta] of Object.entries(fieldMeta)) {
    const queue = screen.relationQueues[name];
    if (queue && queue.kind === meta.type) {
      values[name] = relationQueueOnChangeValue(queue);
      continue;
    }
    if (!(name in screen.values)) continue;
    const raw = screen.values[name];
    if (meta.type === "many2many") {
      values[name] = relationValueForOnChange("many2many", raw);
    } else if (meta.type === "one2many") {
      values[name] = relationValueForOnChange("one2many", raw);
    } else {
      values[name] = raw;
    }
  }
  return values;
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
    } else if (meta.type === "integer") {
      const number = typeof raw === "number" ? raw : Number(raw);
      values[key] = Number.isInteger(number) ? number : raw;
    } else if (meta.type === "float") {
      const number = typeof raw === "number" ? raw : Number(raw);
      values[key] = Number.isFinite(number) ? number : raw;
    } else if (
      meta.type === "reference" ||
      meta.type === "dict" ||
      meta.type === "multiselection" ||
      meta.type === "date" ||
      meta.type === "datetime" ||
      meta.type === "time"
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

function numericId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function relationValueForOnChange(kind: RelationFieldKind, value: unknown): unknown[] {
  if (!isTrytonRelationCommands(value)) {
    if (kind === "many2many") return idsFromRelationValue(value);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return [{ ...(item as Record<string, unknown>) }];
      }
      const id = Array.isArray(item) ? numericId(item[0]) : numericId(item);
      return id == null ? [] : [{ id }];
    });
  }

  const queue: RelationCommandQueue = {
    kind,
    ids: idsFromRelationValue(value),
    baselineIds: [],
    commands: relationCommandsFromWire(value),
  };
  return relationQueueOnChangeValue(queue);
}

function relationCommandsFromWire(value: unknown): O2MCommand[] {
  if (!Array.isArray(value)) return [];
  const commands: O2MCommand[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || typeof item[0] !== "string") continue;
    const op = item[0];
    if (op === "create" && item[1] && typeof item[1] === "object" && !Array.isArray(item[1])) {
      commands.push({ op, values: { ...(item[1] as Record<string, unknown>) } });
      continue;
    }
    if (
      op === "write" &&
      Array.isArray(item[1]) &&
      item[2] &&
      typeof item[2] === "object" &&
      !Array.isArray(item[2])
    ) {
      for (const rawId of item[1]) {
        const id = numericId(rawId);
        if (id != null)
          commands.push({ op, id, values: { ...(item[2] as Record<string, unknown>) } });
      }
      continue;
    }
    if ((op === "add" || op === "remove" || op === "delete") && Array.isArray(item[1])) {
      for (const rawId of item[1]) {
        const id = numericId(rawId);
        if (id != null) commands.push({ op, id });
      }
    }
  }
  return commands;
}
