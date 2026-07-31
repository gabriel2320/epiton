/**
 * Hierarchical tree helpers (Tryton TreeMixin / field_childs).
 */

import type { ParsedView, ViewNode } from "./parse";

export type TreeMeta = {
  parentField: string | null;
  childField: string | null;
  sequenceField: string | null;
  keywordOpen: boolean;
  hierarchical: boolean;
};

export type FlatTreeRow = {
  row: Record<string, unknown>;
  depth: number;
  hasChildren: boolean;
};

export type FlattenOptions = {
  /** Parents known to have no children (after lazy fetch). */
  emptyParents?: ReadonlySet<number>;
};

function findTreeNode(arch: ViewNode): ViewNode {
  if (arch.tag === "tree") return arch;
  for (const child of arch.children) {
    if (child.tag === "tree") return child;
  }
  return arch;
}

function parentIdOf(row: Record<string, unknown>, parentField: string): number | null {
  const raw = row[parentField];
  if (raw == null || raw === false) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw[0];
  return null;
}

function rowId(row: Record<string, unknown>): number | null {
  const id = Number(row.id);
  return Number.isFinite(id) ? id : null;
}

/** Detect parent/child tree metadata from fields_view_get + model. */
export function treeMeta(view: ParsedView, model: string): TreeMeta {
  const tree = findTreeNode(view.arch);
  const sequenceField = tree.attrs.sequence?.trim() || null;
  const keywordOpen = ["1", "true", "True"].includes(tree.attrs.keyword_open ?? "");
  const childField =
    typeof view.fieldChilds === "string" && view.fieldChilds.trim()
      ? view.fieldChilds.trim()
      : null;

  let parentField: string | null = null;
  for (const [name, field] of Object.entries(view.fields)) {
    if (field.type !== "many2one") continue;
    if (field.relation === model && (name === "parent" || name.endsWith("_parent"))) {
      parentField = name;
      break;
    }
  }
  if (!parentField && view.fields.parent?.type === "many2one") {
    parentField = "parent";
  }

  return {
    parentField,
    childField,
    sequenceField,
    keywordOpen,
    hierarchical: Boolean(parentField),
  };
}

/**
 * Flatten parent/child rows for a virtualized table.
 * Rows whose parent is missing from the set become roots.
 */
export function flattenTreeRows(
  rows: Array<Record<string, unknown>>,
  meta: TreeMeta,
  expanded: ReadonlySet<number>,
  options: FlattenOptions = {},
): FlatTreeRow[] {
  if (!meta.parentField || !rows.length) {
    return rows.map((row) => ({ row, depth: 0, hasChildren: false }));
  }

  const parentField = meta.parentField;
  const byId = new Map<number, Record<string, unknown>>();
  const children = new Map<number, number[]>();

  for (const row of rows) {
    const id = rowId(row);
    if (id == null) continue;
    byId.set(id, row);
  }

  const roots: number[] = [];
  for (const id of byId.keys()) {
    const row = byId.get(id);
    if (!row) continue;
    const parent = parentIdOf(row, parentField);
    if (parent != null && byId.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(id);
      children.set(parent, list);
    } else {
      roots.push(id);
    }
  }

  const seq = meta.sequenceField;
  const sortIds = (ids: number[]) => {
    if (!seq) return ids;
    return [...ids].sort((a, b) => {
      const av = Number(byId.get(a)?.[seq] ?? 0);
      const bv = Number(byId.get(b)?.[seq] ?? 0);
      return av - bv;
    });
  };

  const emptyParents = options.emptyParents ?? new Set<number>();
  const out: FlatTreeRow[] = [];
  const walk = (id: number, depth: number) => {
    const row = byId.get(id);
    if (!row) return;
    const kids = sortIds(children.get(id) ?? []);
    const childFieldHint = meta.childField ? row[meta.childField] : null;
    const hinted =
      Array.isArray(childFieldHint) &&
      childFieldHint.map(Number).filter((n) => Number.isFinite(n)).length > 0;
    // Without field_childs, allow expand until a lazy fetch proves empty.
    const speculative = !meta.childField && !emptyParents.has(id);
    const hasChildren = kids.length > 0 || hinted || speculative;
    out.push({ row, depth, hasChildren });
    if (kids.length && expanded.has(id)) {
      for (const kid of kids) walk(kid, depth + 1);
    }
  };

  for (const id of sortIds(roots)) walk(id, 0);
  return out;
}

/** Merge base list rows with lazily fetched children (dedupe by id). */
export function mergeTreeRows(
  base: Array<Record<string, unknown>>,
  extras: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byId = new Map<number, Record<string, unknown>>();
  for (const row of [...base, ...extras]) {
    const id = rowId(row);
    if (id == null) continue;
    byId.set(id, row);
  }
  return [...byId.values()];
}
