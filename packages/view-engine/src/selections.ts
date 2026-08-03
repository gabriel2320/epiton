import type { ParsedView, SelectionKey } from "./parse";
import { evalContext, evalDomain } from "./pyson";

export interface RelationSelectionRequest {
  fieldName: string;
  relation: string;
  domain: unknown[];
  context: Record<string, unknown>;
  currentValue: unknown;
}

export interface RelationSelectionRow {
  id?: unknown;
  rec_name?: unknown;
  name?: unknown;
}

export type RelationSelectionLoader = (
  request: RelationSelectionRequest,
) => Promise<RelationSelectionRow[]>;

export function normalizeSelectionKey(value: unknown): SelectionKey | undefined {
  const key = Array.isArray(value) ? value[0] : value;
  return key === null ||
    typeof key === "string" ||
    typeof key === "number" ||
    typeof key === "boolean"
    ? key
    : undefined;
}

export function encodeSelectionKey(key: SelectionKey): string {
  if (typeof key === "string") {
    return key === "" || /^(?:string|number|boolean|null):/.test(key) ? `string:${key}` : key;
  }
  return key === null ? "null:" : `${typeof key}:${String(key)}`;
}

export function decodeSelectionKey(
  options: Array<[SelectionKey, string]>,
  encoded: string,
): SelectionKey | undefined {
  return options.find(([key]) => encodeSelectionKey(key) === encoded)?.[0];
}

export function selectionValueText(key: SelectionKey): string {
  return typeof key === "string" ? JSON.stringify(key) : String(key);
}

function relationValue(value: unknown): { id: SelectionKey; label?: string } | null {
  const rawId = normalizeSelectionKey(value);
  if (rawId === undefined) return null;
  if (rawId === null || rawId === "") return null;
  const label = Array.isArray(value) && value[1] != null ? String(value[1]) : undefined;
  return { id: rawId, label };
}

/** Resolve every Many2One rendered with Tryton's `widget="selection"`. */
export function relationSelectionRequests(
  view: ParsedView,
  values: Record<string, unknown>,
): RelationSelectionRequest[] {
  return Object.values(view.fields)
    .filter((field) => field.type === "selection" && Boolean(field.relation))
    .map((field) => ({
      fieldName: field.name,
      relation: field.relation ?? "",
      domain: evalDomain(field.domain ?? [], values),
      context: evalContext(field.context ?? {}, values),
      currentValue: values[field.name],
    }));
}

/**
 * Hydrate relation-backed selections without mutating the parsed view.
 *
 * This mirrors Tryton's SelectionMixin contract: relation rows come from
 * search_read using the evaluated domain/context, a null choice is present,
 * and an already selected inactive tuple remains visible.
 */
export async function hydrateRelationSelections(
  view: ParsedView,
  values: Record<string, unknown>,
  load: RelationSelectionLoader,
): Promise<ParsedView> {
  const requests = relationSelectionRequests(view, values);
  if (!requests.length) return view;

  const results = await Promise.all(
    requests.map(async (request) => ({ request, rows: await load(request) })),
  );
  const fields = { ...view.fields };

  for (const { request, rows } of results) {
    const options: Array<[SelectionKey, string]> = [];
    for (const row of rows) {
      const id = row.id;
      if (typeof id !== "number" && typeof id !== "string") continue;
      const label = row.rec_name ?? row.name;
      if (label == null) continue;
      if (options.some(([candidate]) => Object.is(candidate, id))) continue;
      options.push([id, String(label)]);
    }

    const current = relationValue(request.currentValue);
    if (current?.label && !options.some(([candidate]) => Object.is(candidate, current.id))) {
      options.push([current.id, current.label]);
    }
    options.push([null, ""]);

    const field = fields[request.fieldName];
    if (field) fields[request.fieldName] = { ...field, selection: options };
  }

  return { ...view, fields };
}
