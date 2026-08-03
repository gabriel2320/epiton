import type { ViewField } from "./parse";
import type { O2MCommand } from "./relations";
import type { RecordValues } from "./render";
import {
  createRelationQueue,
  createScreen,
  hydrateScreenFromRecord,
  idsFromRelationValue,
  type RelationCommandQueue,
  relationQueueOnChangeValue,
  relationQueueWithTrytonTimestamps,
  type ScreenState,
  screenIsDirty,
  screenTrytonTimestamps,
  screenValuesForSave,
  setScreenRelationQueue,
  updateScreenValues,
} from "./screen";

/** The parent relation entry represented by an embedded Screen. */
export type ChildScreenTarget =
  | { kind: "new" }
  | { kind: "record"; id: number }
  | { kind: "queued-create"; commandIndex: number };

/**
 * Process-local lifecycle for an O2M/M2M form.
 *
 * The child owns an editable snapshot only. It cannot write trytond: accepting
 * the child produces a command for the parent-owned relation queue.
 */
export interface ChildScreenState {
  target: ChildScreenTarget;
  screen: ScreenState;
  /** Bumped whenever outstanding async work must be invalidated. */
  generation: number;
  /** Last on_change request started for this generation. */
  onChangeRevision: number;
}

/** Identity captured by the host before starting an async child on_change. */
export interface ChildScreenOnChangeToken {
  generation: number;
  revision: number;
  model: string;
  targetKey: string;
}

/** Sao-shaped incremental response accepted by One2Many/Many2Many.set_on_change. */
export interface X2ManyOnChangePatch {
  add?: unknown;
  update?: unknown;
  remove?: unknown;
  delete?: unknown;
}

export type ChildScreenValidationCode = "required" | "nested-invalid";

/** Machine-readable validation result. Presentation/localization belongs to the host. */
export interface ChildScreenValidationIssue {
  code: ChildScreenValidationCode;
  /** Field path relative to this child; nested paths are prefixed while bubbling. */
  path: string[];
}

export type ChildScreenNestedIssues = Readonly<
  Record<string, readonly ChildScreenValidationIssue[]>
>;

export type ChildScreenExitDecision =
  | { kind: "allow" }
  | { kind: "confirm-discard"; reason: "unsaved-child" };

export type ChildScreenCommitResult =
  | {
      ok: true;
      queue: RelationCommandQueue;
      command: Extract<O2MCommand, { op: "create" | "write" }>;
      commandIndex: number;
    }
  | {
      ok: false;
      queue: RelationCommandQueue;
      reason: "not-ready" | "validation" | "stale-target";
      issues: ChildScreenValidationIssue[];
    };

export type ChildScreenRemovalResult =
  | {
      ok: true;
      queue: RelationCommandQueue;
      command: Extract<O2MCommand, { op: "delete" | "remove" }> | null;
    }
  | {
      ok: false;
      queue: RelationCommandQueue;
      reason: "invalid-target" | "stale-target";
    };

/** Create a child lifecycle. Existing records remain unready until hydrated. */
export function createChildScreen(
  model: string,
  target: ChildScreenTarget,
  values?: RecordValues,
): ChildScreenState {
  const recordId = target.kind === "record" ? target.id : null;
  return {
    target,
    screen: createScreen(model, recordId, values),
    generation: 0,
    onChangeRevision: 0,
  };
}

/** Apply defaults or a record snapshot without overwriting an edited child. */
export function hydrateChildScreen(
  child: ChildScreenState,
  values: RecordValues,
): ChildScreenState {
  const hydrated = hydrateScreenFromRecord(
    child.screen,
    child.screen.model,
    child.screen.recordId,
    values,
  );
  if (hydrated === child.screen) return child;
  return { ...child, screen: hydrated };
}

export function updateChildScreenValues(
  child: ChildScreenState,
  values: RecordValues,
): ChildScreenState {
  return { ...child, screen: updateScreenValues(child.screen, values) };
}

export function setChildScreenRelationQueue(
  child: ChildScreenState,
  fieldName: string,
  queue: RelationCommandQueue,
): ChildScreenState {
  return { ...child, screen: setScreenRelationQueue(child.screen, fieldName, queue) };
}

export function childScreenIsDirty(child: ChildScreenState): boolean {
  return screenIsDirty(child.screen);
}

/**
 * Start a request after publishing the returned child state. Only the token
 * from the latest revision may later patch the child.
 */
export function beginChildScreenOnChange(child: ChildScreenState): {
  child: ChildScreenState;
  token: ChildScreenOnChangeToken;
} {
  const next = { ...child, onChangeRevision: child.onChangeRevision + 1 };
  return {
    child: next,
    token: {
      generation: next.generation,
      revision: next.onChangeRevision,
      model: next.screen.model,
      targetKey: childScreenTargetKey(next.target),
    },
  };
}

/** Merge an on_change patch only when identity, generation and revision still match. */
export function applyChildScreenOnChange(
  child: ChildScreenState,
  token: ChildScreenOnChangeToken,
  patch: RecordValues,
): ChildScreenState {
  if (!acceptChildScreenOnChange(child, token)) return child;
  if (!Object.keys(patch).length) return child;
  return updateChildScreenValues(child, { ...child.screen.values, ...patch });
}

/**
 * Apply a Tryton on_change response, translating x2many patches back into the
 * child's relation queues while preserving the latest-request identity guard.
 */
export function applyChildScreenTrytonOnChange(
  child: ChildScreenState,
  token: ChildScreenOnChangeToken,
  patch: RecordValues,
  fields: Readonly<Record<string, ViewField>>,
): ChildScreenState {
  if (!acceptChildScreenOnChange(child, token)) return child;
  if (!Object.keys(patch).length) return child;

  let screen = child.screen;
  const scalars: RecordValues = {};
  for (const [fieldName, value] of Object.entries(patch)) {
    const type = fields[fieldName]?.type;
    if (type !== "one2many" && type !== "many2many") {
      scalars[fieldName] = value;
      continue;
    }
    const current =
      screen.relationQueues[fieldName] ?? createRelationQueue(type, screen.values[fieldName]);
    const queue = applyRelationQueueOnChange(current, value);
    screen = setScreenRelationQueue(
      updateScreenValues(screen, {
        ...screen.values,
        [fieldName]: relationQueueOnChangeValue(queue),
      }),
      fieldName,
      queue,
    );
  }
  if (Object.keys(scalars).length) {
    screen = updateScreenValues(screen, { ...screen.values, ...scalars });
  }
  return { ...child, screen };
}

/** Translate a server x2many replacement/patch into an immutable local queue. */
export function applyRelationQueueOnChange(
  queue: RelationCommandQueue,
  value: unknown,
): RelationCommandQueue {
  if (Array.isArray(value)) return replaceRelationQueueFromOnChange(queue, value);
  if (!isX2ManyPatch(value)) return cloneQueue(queue);

  let next = cloneQueue(queue);
  next = removeOnChangeIds(next, value.delete, "delete");
  next = removeOnChangeIds(next, value.remove, "remove");

  for (const [index, data] of onChangeAdds(value.add)) {
    const id = numericRelationId(data.id);
    const values = withoutId(data);
    if (id != null && id < 0) {
      next = patchQueuedCreate(next, id, values);
      continue;
    }
    if (id == null) {
      next.commands.push({ op: "create", values });
      continue;
    }
    const alreadyLinked = next.ids.includes(id);
    next.ids = next.ids.filter((current) => current !== id);
    next.ids.splice(Math.max(0, Math.min(index, next.ids.length)), 0, id);
    if (!alreadyLinked) next.commands.push({ op: "add", id });
    if (Object.keys(values).length) next.commands.push({ op: "write", id, values });
  }

  for (const data of onChangeRecords(value.update)) {
    const id = numericRelationId(data.id);
    if (id == null) continue;
    const values = withoutId(data);
    next =
      id < 0
        ? patchQueuedCreate(next, id, values)
        : cloneQueue(next, [...next.commands, { op: "write", id, values }]);
  }
  return next;
}

export function acceptChildScreenOnChange(
  child: ChildScreenState,
  token: ChildScreenOnChangeToken,
): boolean {
  return (
    token.generation === child.generation &&
    token.revision === child.onChangeRevision &&
    token.model === child.screen.model &&
    token.targetKey === childScreenTargetKey(child.target)
  );
}

/** Required-field validation plus recursively prefixed child issues. */
export function validateChildScreen(
  child: ChildScreenState,
  fields: Readonly<Record<string, ViewField>>,
  nestedIssues: ChildScreenNestedIssues = {},
): ChildScreenValidationIssue[] {
  const issues: ChildScreenValidationIssue[] = [];
  for (const [fieldName, field] of Object.entries(fields)) {
    if (!field.required) continue;
    const queue = child.screen.relationQueues[fieldName];
    const value = queue ? relationQueueLogicalSize(queue) : child.screen.values[fieldName];
    if (!hasRequiredValue(field, value)) {
      issues.push({ code: "required", path: [fieldName] });
    }
  }
  for (const [fieldName, children] of Object.entries(nestedIssues)) {
    for (const issue of children) {
      issues.push({
        code: issue.code === "required" ? "required" : "nested-invalid",
        path: [fieldName, ...issue.path],
      });
    }
  }
  return issues;
}

/** Dirty child navigation requires an explicit discard confirmation. */
export function childScreenExitDecision(child: ChildScreenState): ChildScreenExitDecision {
  return childScreenIsDirty(child)
    ? { kind: "confirm-discard", reason: "unsaved-child" }
    : { kind: "allow" };
}

/** Explicit Cancel discards the draft and invalidates every pending async response. */
export function cancelChildScreen(child: ChildScreenState): ChildScreenState {
  let screen = child.screen.hydrated
    ? createScreen(child.screen.model, child.screen.recordId, child.screen.baseline)
    : createScreen(child.screen.model, child.screen.recordId);
  for (const [fieldName, queue] of Object.entries(child.screen.relationQueues)) {
    screen = setScreenRelationQueue(
      screen,
      fieldName,
      createRelationQueue(queue.kind, queue.baselineIds),
    );
  }
  return {
    ...child,
    screen,
    generation: child.generation + 1,
    onChangeRevision: 0,
  };
}

/**
 * Validate and bubble one create/write operation into the parent queue.
 * No RPC occurs here; the parent Screen remains the single mutation boundary.
 */
export function commitChildScreen(
  queue: RelationCommandQueue,
  child: ChildScreenState,
  fields: Readonly<Record<string, ViewField>>,
  nestedIssues: ChildScreenNestedIssues = {},
): ChildScreenCommitResult {
  if (!child.screen.hydrated) {
    return { ok: false, queue, reason: "not-ready", issues: [] };
  }
  const issues = validateChildScreen(child, fields, nestedIssues);
  if (issues.length) return { ok: false, queue, reason: "validation", issues };

  const values = screenValuesForSave(child.screen, fields as Record<string, ViewField>);
  const guardedQueue = relationQueueWithTrytonTimestamps(
    queue,
    screenTrytonTimestamps(child.screen),
  );
  if (child.target.kind === "new") {
    const command = { op: "create", values } as const;
    const commandIndex = guardedQueue.commands.length;
    return {
      ok: true,
      command,
      commandIndex,
      queue: cloneQueue(guardedQueue, [...guardedQueue.commands, command]),
    };
  }
  if (child.target.kind === "record") {
    if (!queue.ids.includes(child.target.id)) {
      return { ok: false, queue, reason: "stale-target", issues: [] };
    }
    const command = { op: "write", id: child.target.id, values } as const;
    const commandIndex = guardedQueue.commands.length;
    return {
      ok: true,
      command,
      commandIndex,
      queue: cloneQueue(guardedQueue, [...guardedQueue.commands, command]),
    };
  }

  const commandIndex = child.target.commandIndex;
  const current = guardedQueue.commands[commandIndex];
  if (current?.op !== "create") {
    return { ok: false, queue, reason: "stale-target", issues: [] };
  }
  const command = { op: "create", values } as const;
  return {
    ok: true,
    command,
    commandIndex,
    queue: cloneQueue(
      guardedQueue,
      guardedQueue.commands.map((item, index) => (index === commandIndex ? command : item)),
    ),
  };
}

/**
 * Remove a persisted relation row or discard a queued create. The caller
 * chooses unlink (`remove`) versus record deletion (`delete`) from view policy.
 */
export function removeChildScreen(
  queue: RelationCommandQueue,
  target: ChildScreenTarget,
  operation: "remove" | "delete" = "remove",
): ChildScreenRemovalResult {
  if (target.kind === "new") {
    return { ok: false, queue, reason: "invalid-target" };
  }
  if (target.kind === "queued-create") {
    if (queue.commands[target.commandIndex]?.op !== "create") {
      return { ok: false, queue, reason: "stale-target" };
    }
    return {
      ok: true,
      command: null,
      queue: cloneQueue(
        queue,
        queue.commands.filter((_command, index) => index !== target.commandIndex),
      ),
    };
  }
  if (!queue.ids.includes(target.id)) {
    return { ok: false, queue, reason: "stale-target" };
  }
  const command = { op: operation, id: target.id } as const;
  return {
    ok: true,
    command,
    queue: {
      ...cloneQueue(queue, [...queue.commands, command]),
      ids: queue.ids.filter((id) => id !== target.id),
    },
  };
}

export function childScreenTargetKey(target: ChildScreenTarget): string {
  switch (target.kind) {
    case "new":
      return "new";
    case "record":
      return `record:${target.id}`;
    case "queued-create":
      return `queued-create:${target.commandIndex}`;
  }
}

function cloneQueue(
  queue: RelationCommandQueue,
  commands: O2MCommand[] = queue.commands,
): RelationCommandQueue {
  return {
    ...queue,
    ids: [...queue.ids],
    baselineIds: [...queue.baselineIds],
    commands: [...commands],
    ...(queue.timestamps ? { timestamps: { ...queue.timestamps } } : {}),
  };
}

function replaceRelationQueueFromOnChange(
  queue: RelationCommandQueue,
  value: unknown[],
): RelationCommandQueue {
  if (queue.kind === "many2many") {
    return { ...cloneQueue(queue, []), ids: idsFromRelationValue(value) };
  }
  const ids: number[] = [];
  const commands: O2MCommand[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      const id = numericRelationId(item);
      if (id != null && id > 0 && !ids.includes(id)) ids.push(id);
      continue;
    }
    const data = item as Record<string, unknown>;
    const id = numericRelationId(data.id);
    const values = withoutId(data);
    if (id == null || id < 0) {
      commands.push({ op: "create", values });
    } else {
      if (!ids.includes(id)) ids.push(id);
      if (Object.keys(values).length) commands.push({ op: "write", id, values });
    }
  }
  return { ...cloneQueue(queue, commands), ids };
}

function isX2ManyPatch(value: unknown): value is X2ManyOnChangePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.some(
    (key) => key === "add" || key === "update" || key === "remove" || key === "delete",
  );
}

function numericRelationId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function relationIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const id = numericRelationId(item);
    return id == null ? [] : [id];
  });
}

function removeOnChangeIds(
  queue: RelationCommandQueue,
  rawIds: unknown,
  operation: "remove" | "delete",
): RelationCommandQueue {
  const ids = relationIds(rawIds);
  const next = cloneQueue(queue);
  const queued = ids
    .filter((id) => id < 0)
    .map((id) => ({ id, index: -id - 1 }))
    .sort((left, right) => right.index - left.index);
  for (const { index } of queued) {
    if (next.commands[index]?.op === "create") {
      next.commands = next.commands.filter((_command, commandIndex) => commandIndex !== index);
    }
  }
  for (const id of ids.filter((candidate) => candidate >= 0)) {
    next.ids = next.ids.filter((candidate) => candidate !== id);
    next.commands.push({ op: operation, id });
  }
  return next;
}

function onChangeAdds(value: unknown): Array<[number, Record<string, unknown>]> {
  if (!Array.isArray(value)) return [];
  const adds: Array<[number, Record<string, unknown>]> = [];
  for (const item of value) {
    if (!Array.isArray(item) || !item[1] || typeof item[1] !== "object" || Array.isArray(item[1])) {
      continue;
    }
    const index = Number(item[0]);
    adds.push([
      Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER,
      item[1] as Record<string, unknown>,
    ]);
  }
  return adds;
}

function onChangeRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function withoutId(data: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...values } = data;
  return values;
}

function patchQueuedCreate(
  queue: RelationCommandQueue,
  temporaryId: number,
  values: Record<string, unknown>,
): RelationCommandQueue {
  const commandIndex = -temporaryId - 1;
  if (queue.commands[commandIndex]?.op !== "create") {
    return cloneQueue(queue, [...queue.commands, { op: "create", values }]);
  }
  return cloneQueue(
    queue,
    queue.commands.map((command, index) =>
      index === commandIndex && command.op === "create"
        ? { op: "create", values: { ...command.values, ...values } }
        : command,
    ),
  );
}

function relationQueueLogicalSize(queue: RelationCommandQueue): number {
  const ids = new Set(queue.ids);
  let creates = 0;
  for (const command of queue.commands) {
    if (command.op === "add") ids.add(command.id);
    else if (command.op === "remove" || command.op === "delete") ids.delete(command.id);
    else if (command.op === "create") creates += 1;
  }
  return ids.size + creates;
}

function hasRequiredValue(field: ViewField, value: unknown): boolean {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (field.type === "many2one") {
    if (!Array.isArray(value)) return Number.isFinite(Number(value));
    return value[0] != null && value[0] !== "";
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
