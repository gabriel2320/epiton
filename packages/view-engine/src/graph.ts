import type { ViewNode } from "./parse";

export const GRAPH_ROW_LIMIT = 500;

export type GraphChartType = "vbar" | "hbar" | "line" | "pie";

export interface GraphSpec {
  type: GraphChartType;
  xFields: string[];
  yFields: string[];
  string?: string;
}

/** Infer x/y field names from graph/tree field lists. */
export function inferGraphFields(fieldNames: string[]): { xField: string; yField: string } {
  const x =
    fieldNames.find((n) => /name|label|code|type|state/i.test(n)) ?? fieldNames[0] ?? "name";
  const y =
    fieldNames.find((n) => /amount|total|qty|quantity|count|value|id/i.test(n) && n !== x) ??
    fieldNames.find((n) => n !== x) ??
    "id";
  return { xField: x, yField: y };
}

/**
 * Parse Tryton graph arch (`type`, nested `<x>` / `<y>` field names).
 * Falls back to null when the arch is not a graph.
 */
export function parseGraphArch(root: ViewNode): GraphSpec | null {
  const graph =
    root.tag === "graph" ? root : (root.children.find((c) => c.tag === "graph") ?? root);
  if (graph.tag !== "graph" && !graph.children.some((c) => c.tag === "x" || c.tag === "y")) {
    if (root.tag !== "graph") return null;
  }
  const node = root.tag === "graph" ? root : graph.tag === "graph" ? graph : root;
  const rawType = (node.attrs.type ?? "vbar").toLowerCase();
  const type: GraphChartType =
    rawType === "hbar" || rawType === "line" || rawType === "pie" ? rawType : "vbar";

  const xFields: string[] = [];
  const yFields: string[] = [];

  function collect(section: ViewNode | undefined, into: string[]) {
    if (!section) return;
    for (const child of section.children) {
      if (child.tag === "field" && child.attrs.name) into.push(child.attrs.name);
    }
  }

  for (const child of node.children) {
    if (child.tag === "x") collect(child, xFields);
    if (child.tag === "y") collect(child, yFields);
  }

  // Flat field list fallback (some modules omit x/y wrappers)
  if (!xFields.length && !yFields.length) {
    const fields = node.children.filter((c) => c.tag === "field" && c.attrs.name);
    if (fields.length >= 2) {
      xFields.push(fields[0]!.attrs.name!);
      for (const f of fields.slice(1)) yFields.push(f.attrs.name!);
    } else if (fields.length === 1) {
      xFields.push(fields[0]!.attrs.name!);
    }
  }

  if (!xFields.length && !yFields.length) return null;
  return {
    type,
    xFields: xFields.length ? xFields : ["rec_name"],
    yFields: yFields.length ? yFields : ["id"],
    string: node.attrs.string || undefined,
  };
}

export function rowsToGraphData(
  rows: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
): Array<{ x: string; y: number }> {
  return rows.slice(0, GRAPH_ROW_LIMIT).map((row) => ({
    x: cellLabel(row[xField] ?? row.rec_name ?? row.id),
    y: cellNumber(row[yField]),
  }));
}

/** Group by x and sum y — extracts distribution value from raw rows. */
export function aggregateGraphData(
  rows: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
): Array<{ x: string; y: number }> {
  const map = new Map<string, number>();
  for (const row of rows.slice(0, GRAPH_ROW_LIMIT * 2)) {
    const x = cellLabel(row[xField] ?? row.rec_name ?? row.id);
    const y = cellNumber(row[yField]);
    map.set(x, (map.get(x) ?? 0) + y);
  }
  return [...map.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => b.y - a.y)
    .slice(0, GRAPH_ROW_LIMIT);
}

/** Multi-series: one column per y field (first x field). */
export function rowsToMultiSeries(
  rows: Array<Record<string, unknown>>,
  xField: string,
  yFields: string[],
): Array<Record<string, string | number>> {
  return rows.slice(0, GRAPH_ROW_LIMIT).map((row) => {
    const out: Record<string, string | number> = {
      x: cellLabel(row[xField] ?? row.rec_name ?? row.id),
    };
    for (const y of yFields) out[y] = cellNumber(row[y]);
    return out;
  });
}

function cellLabel(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  return String(value);
}

function cellNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value) && typeof value[0] === "number") return value[0];
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
