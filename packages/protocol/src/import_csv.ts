/**
 * Tryton import_data helpers + CSV parse (Sao parity without copying GPL).
 */

import type { EpitonClient, JsonObject, JsonValue } from "./index";

/** Parse a simple CSV string into rows (supports quoted fields). */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  while (i < src.length) {
    const ch = src[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.length > 0) || row.length > 1) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Import CSV via model.import_data(fields, data).
 * First row is treated as header when `header` is true (default).
 * Returns number of imported records (server result).
 */
export async function importModelCsv(
  client: EpitonClient,
  model: string,
  csvText: string,
  options: {
    fields?: string[];
    header?: boolean;
    delimiter?: string;
    context?: JsonObject;
  } = {},
): Promise<number> {
  const rows = parseCsv(csvText, options.delimiter ?? ",");
  if (!rows.length) throw new Error("CSV is empty");

  const header = options.header !== false;
  let fields = options.fields ?? [];
  let dataRows = rows;

  if (header) {
    fields = rows[0]?.map((h) => h.trim()).filter(Boolean) ?? [];
    dataRows = rows.slice(1);
  }
  if (!fields.length) throw new Error("CSV has no field names");
  if (!dataRows.length) throw new Error("CSV has no data rows");

  const data: JsonValue[] = dataRows.map((row) =>
    fields.map((_, idx) => {
      const v = row[idx] ?? "";
      if (v === "") return null;
      if (/^-?\d+$/.test(v)) return Number(v);
      if (/^-?\d+\.\d+$/.test(v)) return Number(v);
      if (v === "true" || v === "True") return true;
      if (v === "false" || v === "False") return false;
      return v;
    }),
  );

  const result = await client.model(model, "import_data", [fields, data], options.context ?? {});
  if (typeof result === "number") return result;
  if (typeof result === "string" && Number.isFinite(Number(result))) return Number(result);
  return dataRows.length;
}
