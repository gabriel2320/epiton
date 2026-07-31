/** Build a simple Tryton domain from a user search string. */
export function buildSearchDomain(
  query: string,
  fields: string[] = ["rec_name", "name", "code"],
): unknown[] {
  const term = query.trim();
  if (!term) return [];
  if (term.startsWith("[") && term.endsWith("]")) {
    try {
      const parsed = JSON.parse(term) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      try {
        const parsed = JSON.parse(term.replace(/'/g, '"')) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // fall through to ilike
      }
    }
  }
  if (/^\d+$/.test(term)) {
    return [["id", "=", Number(term)]];
  }
  if (fields.length === 1) {
    return [[fields[0], "ilike", `%${term}%`]];
  }
  const ors: unknown[] = ["OR"];
  for (const field of fields) {
    ors.push([field, "ilike", `%${term}%`]);
  }
  return [ors];
}

/** Merge action domain with user search domain. */
export function mergeDomains(base: unknown[] | undefined, extra: unknown[]): unknown[] {
  const a = Array.isArray(base) ? base : [];
  const b = Array.isArray(extra) ? extra : [];
  if (!a.length) return b;
  if (!b.length) return a;
  return [...a, ...b];
}

/** Format Tryton order string from column sort state. */
export function formatOrder(sorts: Array<{ id: string; desc: boolean }>): string | null {
  if (!sorts.length) return null;
  return sorts.map((s) => `${s.id} ${s.desc ? "DESC" : "ASC"}`).join(", ");
}
