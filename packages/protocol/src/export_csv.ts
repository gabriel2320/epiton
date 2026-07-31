/**
 * Tryton export_data → client CSV (Sao parity without copying GPL).
 */

import type { EpitonClient, JsonObject, JsonValue } from "./index";

/** Escape one CSV cell (RFC-style quoting). */
export function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = Array.isArray(value)
    ? value.map((v) => (v == null ? "" : String(v))).join(",")
    : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Convert export_data rows (list of lists) to a CSV string. */
export function rowsToCsv(rows: unknown[][], delimiter = ","): string {
  return rows.map((row) => row.map(csvEscape).join(delimiter)).join("\n");
}

/**
 * Call model.export_data(ids, fields, header?) and return CSV text.
 * Falls back to export_data_domain when ids are empty.
 */
export async function exportModelCsv(
  client: EpitonClient,
  model: string,
  options: {
    ids?: number[];
    fields: string[];
    domain?: JsonValue[];
    header?: boolean;
    context?: JsonObject;
  },
): Promise<string> {
  const fields = options.fields.length ? options.fields : ["id", "rec_name"];
  const header = options.header !== false;
  const context = options.context ?? {};
  const ids = (options.ids ?? []).filter((n) => Number.isFinite(n));

  let raw: JsonValue;
  if (ids.length) {
    raw = await client.model(model, "export_data", [ids, fields, header], context);
  } else {
    try {
      raw = await client.model(
        model,
        "export_data_domain",
        [options.domain ?? [], fields, 0, 500, null, header],
        context,
      );
    } catch {
      raw = await client.model(model, "export_data", [[], fields, header], context);
    }
  }

  if (!Array.isArray(raw)) {
    throw new Error("export_data expected array of rows");
  }
  const rows = raw.map((row) => (Array.isArray(row) ? row : [row]));
  return rowsToCsv(rows);
}
