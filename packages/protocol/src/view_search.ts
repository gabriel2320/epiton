/**
 * Named screen filters (Sao ir.ui.view_search).
 */

import type { EpitonClient, JsonObject, JsonValue } from "./index";

export type ViewSearchRow = {
  id: number;
  name: string;
  model: string;
  domain: JsonValue;
  user: number | null;
};

function parseStoredDomain(raw: unknown): JsonValue {
  if (Array.isArray(raw)) return raw as JsonValue;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return JSON.parse(trimmed) as JsonValue;
    } catch {
      return trimmed as JsonValue;
    }
  }
  return [];
}

function asUserId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw[0];
  return null;
}

/** Load saved searches for a model (user-owned + shared). Soft-fails to []. */
export async function loadViewSearches(
  client: EpitonClient,
  model: string,
  userId: number,
  context: JsonObject = {},
): Promise<ViewSearchRow[]> {
  try {
    const rows = await client.searchRead(
      "ir.ui.view_search",
      [
        ["model", "=", model],
        ["OR", ["user", "=", userId], ["user", "=", null]],
      ],
      ["name", "model", "domain", "user"],
      0,
      80,
      "name ASC",
      context,
    );
    return rows
      .map((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id)) return null;
        return {
          id,
          name: String(row.name ?? id),
          model: String(row.model ?? model),
          domain: parseStoredDomain(row.domain),
          user: asUserId(row.user),
        } satisfies ViewSearchRow;
      })
      .filter((r): r is ViewSearchRow => r != null);
  } catch {
    return [];
  }
}

/** Persist current domain as a named search. Domain stored as JSON string. */
export async function createViewSearch(
  client: EpitonClient,
  values: { name: string; model: string; domain: JsonValue; user?: number | null },
  context: JsonObject = {},
): Promise<number | null> {
  const name = values.name.trim();
  if (!name) throw new Error("Saved search needs a name");
  const domainText =
    typeof values.domain === "string" ? values.domain : JSON.stringify(values.domain ?? []);
  const result = await client.model(
    "ir.ui.view_search",
    "create",
    [
      [
        {
          name,
          model: values.model,
          domain: domainText,
          ...(values.user != null ? { user: values.user } : {}),
        },
      ],
    ],
    context,
  );
  if (Array.isArray(result) && typeof result[0] === "number") return result[0];
  if (typeof result === "number") return result;
  return null;
}

/** Delete a saved search by id. */
export async function deleteViewSearch(
  client: EpitonClient,
  id: number,
  context: JsonObject = {},
): Promise<void> {
  await client.model("ir.ui.view_search", "delete", [[id]], context);
}
