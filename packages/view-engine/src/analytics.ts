/**
 * Client-side analytics over Tryton `search_read` rows.
 * Never a second source of truth — only visual value extraction.
 */

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface SeriesInsight {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  top: SeriesPoint[];
}

/** Summarize a chart series for dashboard / report companion strips. */
export function summarizeSeries(data: SeriesPoint[], topN = 5): SeriesInsight {
  if (!data.length) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0, top: [] };
  }
  let sum = 0;
  let min = data[0]!.y;
  let max = data[0]!.y;
  for (const p of data) {
    sum += p.y;
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  const top = [...data].sort((a, b) => b.y - a.y).slice(0, topN);
  return {
    count: data.length,
    sum,
    avg: sum / data.length,
    min,
    max,
    top,
  };
}

/** Pick numeric field candidates from a row sample (for report analytics). */
export function numericFieldCandidates(
  rows: Array<Record<string, unknown>>,
  exclude: string[] = ["id"],
): string[] {
  if (!rows.length) return [];
  const skip = new Set(exclude);
  const first = rows[0]!;
  const out: string[] = [];
  for (const [key, value] of Object.entries(first)) {
    if (skip.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out.push(key);
  }
  return out;
}

/** Pick a categorical label field for grouping. */
export function labelFieldCandidate(
  rows: Array<Record<string, unknown>>,
  prefer: string[] = ["rec_name", "name", "code", "state", "type"],
): string {
  if (!rows.length) return "id";
  const keys = Object.keys(rows[0]!);
  for (const p of prefer) {
    if (keys.includes(p)) return p;
  }
  return keys.find((k) => k !== "id") ?? "id";
}
