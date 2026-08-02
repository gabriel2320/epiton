/** Helpers for One2Many / Many2Many command lists used by Tryton writes. */
export type O2MCommand =
  | { op: "create"; values: Record<string, unknown> }
  | { op: "write"; id: number; values: Record<string, unknown> }
  | { op: "delete"; id: number }
  | { op: "add"; id: number }
  | { op: "remove"; id: number };

export interface RelationProjectionField {
  name: string;
  type?: string;
}

function many2OneFieldNames(fields: readonly RelationProjectionField[]): string[] {
  return [
    ...new Set(fields.filter((field) => field.type === "many2one").map((field) => field.name)),
  ];
}

/**
 * Ask Tryton for the display name of every requested Many2One field.
 *
 * Tryton's native dotted-field protocol returns the scalar relation id in
 * `party` and its projected values in `party.`. The client keeps both pieces
 * only long enough to build its local `[id, rec_name]` widget value.
 */
export function withMany2OneRecNames(
  fieldNames: readonly string[],
  fields: readonly RelationProjectionField[],
): string[] {
  const requested = new Set(fieldNames);
  const projected = many2OneFieldNames(fields)
    .filter((name) => requested.has(name))
    .map((name) => `${name}.rec_name`);
  return [...new Set([...fieldNames, ...projected])];
}

/** Convert Tryton dotted Many2One projections to the tuple used by widgets. */
export function hydrateMany2OneRecNames<T extends Record<string, unknown>>(
  values: T,
  fields: readonly RelationProjectionField[],
): T {
  let hydrated: Record<string, unknown> | null = null;
  for (const name of many2OneFieldNames(fields)) {
    const projectionKey = `${name}.`;
    if (!Object.hasOwn(values, projectionKey)) continue;

    hydrated ??= { ...values };
    const related = values[projectionKey];
    delete hydrated[projectionKey];

    const raw = values[name];
    const id =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Array.isArray(raw) && typeof raw[0] === "number" && Number.isFinite(raw[0])
          ? raw[0]
          : null;
    const recName =
      related && typeof related === "object" && !Array.isArray(related)
        ? (related as Record<string, unknown>).rec_name
        : undefined;
    if (id != null && typeof recName === "string" && recName.length > 0) {
      hydrated[name] = [id, recName];
    }
  }
  return (hydrated ?? values) as T;
}

/** Hydrate a list without changing rows that contain no dotted projections. */
export function hydrateMany2OneRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  fields: readonly RelationProjectionField[],
): T[] {
  return rows.map((row) => hydrateMany2OneRecNames(row, fields));
}

export function toTrytonO2M(commands: O2MCommand[]): unknown[][] {
  return commands.map((c) => {
    switch (c.op) {
      case "create":
        // Tryton's x2many protocol batches child dictionaries for create.
        // Even a single child must be wrapped in a list; passing the
        // dictionary directly makes the server iterate its string keys.
        return ["create", [c.values]];
      case "write":
        return ["write", [c.id], c.values];
      case "delete":
        return ["delete", [c.id]];
      case "add":
        return ["add", [c.id]];
      case "remove":
        return ["remove", [c.id]];
    }
  });
}

/** Set-style M2M write (add all ids). Prefer `toTrytonM2MDelta` when editing. */
export function toTrytonM2M(ids: number[]): unknown[] {
  return [["add", ids]];
}

/** Sao-style M2M delta: add newcomers, remove dropouts. */
export function toTrytonM2MDelta(previous: number[], next: number[]): unknown[] {
  const prev = new Set(previous);
  const nxt = new Set(next);
  const add = next.filter((id) => !prev.has(id));
  const remove = previous.filter((id) => !nxt.has(id));
  const cmds: unknown[] = [];
  if (add.length) cmds.push(["add", add]);
  if (remove.length) cmds.push(["remove", remove]);
  if (!cmds.length && next.length) return [["add", next]];
  return cmds;
}

/** True when value looks like Tryton O2M/M2M command tuples from the line editor. */
export function isTrytonRelationCommands(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.isArray(value[0]) &&
    typeof value[0][0] === "string"
  );
}

/**
 * Logical line count for form badges. Id lists count directly; command lists
 * estimate from add/create minus remove/delete (write does not change count).
 */
export function relationRecordCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (!value.length) return 0;
  if (isTrytonRelationCommands(value)) {
    let n = 0;
    for (const cmd of value) {
      if (!Array.isArray(cmd) || typeof cmd[0] !== "string") continue;
      const op = cmd[0];
      if (op === "create") n += 1;
      else if (op === "add" && Array.isArray(cmd[1])) n += cmd[1].length;
      else if ((op === "remove" || op === "delete") && Array.isArray(cmd[1])) n -= cmd[1].length;
    }
    return Math.max(0, n);
  }
  return value.filter((item) => {
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item) && typeof item[0] === "number") return Number.isFinite(item[0]);
    if (item && typeof item === "object" && "id" in item) {
      return Number.isFinite(Number((item as { id: unknown }).id));
    }
    return false;
  }).length;
}
