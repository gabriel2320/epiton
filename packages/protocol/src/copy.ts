/**
 * Tryton model.copy helper.
 */

import type { EpitonClient, JsonObject, JsonValue } from "./index";

/** Copy records; returns new ids. */
export async function copyRecords(
  client: EpitonClient,
  model: string,
  ids: number[],
  defaults: JsonObject = {},
  context: JsonObject = {},
): Promise<number[]> {
  const clean = ids.filter((n) => Number.isFinite(n));
  if (!clean.length) return [];
  const result = await client.model(model, "copy", [clean, defaults], context);
  if (!Array.isArray(result)) return [];
  return result.map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

export type { JsonValue };
