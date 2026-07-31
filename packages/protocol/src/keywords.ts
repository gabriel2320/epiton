/**
 * Load form_relate / form_print / form_action keywords (Sao get_keyword shape).
 */

import type { EpitonClient, JsonObject, JsonValue } from "./index";

export type ActionKeyword =
  | "form_relate"
  | "form_print"
  | "form_action"
  | "tree_open"
  | "graph_open";

export interface KeywordAction {
  id: number;
  type: string;
  name: string;
  keyword?: string;
  /** Prefer this when opening via resolveAction. */
  ref: string;
  raw: JsonObject;
}

function asObject(value: unknown): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return null;
}

function toKeywordAction(row: JsonObject, keyword: string): KeywordAction | null {
  const id = Number(row.id);
  const type = typeof row.type === "string" ? row.type : "";
  if (!Number.isFinite(id) || !type) return null;
  const name =
    typeof row.name === "string"
      ? row.name
      : typeof row.rec_name === "string"
        ? row.rec_name
        : `${type},${id}`;
  return {
    id,
    type,
    name,
    keyword,
    ref: `${type},${id}`,
    raw: row,
  };
}

/**
 * Call ir.action.keyword.get_keyword(keyword, [model, id]).
 * Soft-fails to [] when the RPC is unavailable.
 */
export async function getKeywords(
  client: EpitonClient,
  keyword: ActionKeyword,
  model: string,
  recordId: number | null = -1,
  context: JsonObject = {},
): Promise<KeywordAction[]> {
  const value: JsonValue = [model, recordId == null ? -1 : recordId];
  try {
    const result = await client.model(
      "ir.action.keyword",
      "get_keyword",
      [keyword, value],
      context,
    );
    if (!Array.isArray(result)) return [];
    return result
      .map((row) => {
        const obj = asObject(row);
        return obj ? toKeywordAction(obj, keyword) : null;
      })
      .filter((x): x is KeywordAction => Boolean(x));
  } catch {
    return [];
  }
}

/** Load relate + print + form actions for a record. */
export async function getRecordKeywords(
  client: EpitonClient,
  model: string,
  recordId: number | null,
  context: JsonObject = {},
): Promise<{
  relate: KeywordAction[];
  print: KeywordAction[];
  action: KeywordAction[];
}> {
  const id = recordId ?? -1;
  const [relate, print, action] = await Promise.all([
    getKeywords(client, "form_relate", model, id, context),
    getKeywords(client, "form_print", model, id, context),
    getKeywords(client, "form_action", model, id, context),
  ]);
  return { relate, print, action };
}
