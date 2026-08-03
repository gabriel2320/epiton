import type { JsonPrimitive } from "@epiton/protocol";
import { hydrateMany2OneRecNames } from "@epiton/view-engine";

interface DefaultField {
  name: string;
  type?: string;
  relation?: string;
}

const SIMPLE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isClause(node: unknown[]): boolean {
  return (
    typeof node[0] === "string" &&
    !["AND", "OR", "NOT", "&", "|", "!"].includes(node[0].toUpperCase()) &&
    typeof node[1] === "string"
  );
}

/**
 * Extract values that Tryton's action domain unambiguously imposes on a new record.
 *
 * Only equality clauses in conjunctions are safe defaults. Disjunctions, negations,
 * dotted paths and conflicting constraints remain backend validation concerns.
 */
export function actionDomainDefaults(
  domain: unknown,
  allowedFields: Iterable<string>,
): Record<string, JsonPrimitive> {
  const allowed = new Set(allowedFields);
  const values = new Map<string, JsonPrimitive>();
  const conflicts = new Set<string>();

  function visit(node: unknown): void {
    if (!Array.isArray(node) || node.length === 0) return;
    const token = typeof node[0] === "string" ? node[0].toUpperCase() : "";
    if (token === "OR" || token === "NOT" || token === "|" || token === "!") return;
    if (token === "AND" || token === "&") {
      for (const child of node.slice(1)) visit(child);
      return;
    }
    if (!isClause(node)) {
      for (const child of node) visit(child);
      return;
    }

    const [field, operator, value] = node;
    if (
      operator !== "=" ||
      typeof field !== "string" ||
      field === "id" ||
      !SIMPLE_FIELD.test(field) ||
      !allowed.has(field) ||
      !isPrimitive(value) ||
      conflicts.has(field)
    ) {
      return;
    }
    if (values.has(field) && values.get(field) !== value) {
      values.delete(field);
      conflicts.add(field);
      return;
    }
    values.set(field, value);
  }

  visit(domain);
  return Object.fromEntries(values);
}

/** Resolve scalar Many2One defaults to the `[id, rec_name]` value shown by widgets. */
export async function hydrateDefaultMany2OneNames<T extends Record<string, unknown>>(
  values: T,
  fields: readonly DefaultField[],
  resolveRecName: (relation: string, id: number) => Promise<string | null>,
): Promise<T> {
  const hydrated = hydrateMany2OneRecNames(values, fields);
  const resolutions = fields.map(async (field) => {
    const raw = hydrated[field.name];
    if (
      field.type !== "many2one" ||
      !field.relation ||
      typeof raw !== "number" ||
      !Number.isFinite(raw)
    ) {
      return null;
    }
    try {
      const recName = await resolveRecName(field.relation, raw);
      return recName ? ([field.name, raw, recName] as const) : null;
    } catch {
      // A display-name lookup must not prevent Tryton defaults from loading.
      return null;
    }
  });
  const resolved = (await Promise.all(resolutions)).filter(
    (item): item is readonly [string, number, string] => item !== null,
  );
  if (!resolved.length) return hydrated;
  return Object.assign(
    { ...hydrated },
    Object.fromEntries(resolved.map(([name, id, recName]) => [name, [id, recName]])),
  ) as T;
}
