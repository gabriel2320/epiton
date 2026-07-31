export const GRAPH_ROW_LIMIT = 500;

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

export function rowsToGraphData(
  rows: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
): Array<{ x: string; y: number }> {
  return rows.slice(0, GRAPH_ROW_LIMIT).map((row) => ({
    x: String(row[xField] ?? row.rec_name ?? row.id ?? ""),
    y: Number(row[yField] ?? 0) || 0,
  }));
}
