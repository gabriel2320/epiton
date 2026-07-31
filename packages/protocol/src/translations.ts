/**
 * Load Tryton ir.translation rows for client catalog wiring.
 */

import type { EpitonClient, JsonObject } from "./index";

export type TranslationRow = {
  name?: string;
  src?: string;
  value?: string;
};

/** Fetch a bounded translation catalog for a language. Soft-fails to []. */
export async function loadTranslationCatalog(
  client: EpitonClient,
  lang: string,
  context: JsonObject = {},
  limit = 4000,
): Promise<TranslationRow[]> {
  const code = lang.trim();
  if (!code) return [];
  try {
    const rows = await client.searchRead(
      "ir.translation",
      [
        ["lang", "=", code],
        ["type", "in", ["view", "model", "report", "wizard_button", "selection"]],
        ["value", "!=", ""],
      ],
      ["name", "src", "value"],
      0,
      limit,
      null,
      context,
    );
    return rows.map((row) => ({
      name: typeof row.name === "string" ? row.name : undefined,
      src: typeof row.src === "string" ? row.src : undefined,
      value: typeof row.value === "string" ? row.value : undefined,
    }));
  } catch {
    return [];
  }
}
