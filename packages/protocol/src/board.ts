/**
 * Resolve board action refs (XML id, numeric id, or model).
 */

import { type ResolvedAction, resolveAction } from "./actions";
import type { EpitonClient, JsonObject } from "./index";

/**
 * Resolve a board action name: numeric id, ir.action ref, XML fs_id, or model.
 */
export async function resolveBoardAction(
  client: EpitonClient,
  name: string,
  context: JsonObject = {},
): Promise<ResolvedAction> {
  const trimmed = name.trim();
  if (!trimmed) return { kind: "unsupported", ref: name, reason: "empty" };

  if (trimmed.includes(",")) {
    return resolveAction(client, trimmed, context);
  }

  if (/^\d+$/.test(trimmed)) {
    return resolveAction(client, `ir.action.act_window,${trimmed}`, context);
  }

  try {
    const rows = await client.searchRead(
      "ir.model.data",
      [
        ["model", "like", "ir.action%"],
        ["fs_id", "=", trimmed],
      ],
      ["model", "db_id"],
      0,
      1,
      null,
      context,
    );
    const row = rows[0];
    if (row && typeof row.model === "string" && row.db_id != null) {
      return resolveAction(client, `${row.model},${row.db_id}`, context);
    }
  } catch {
    // Fall through
  }

  return resolveAction(client, trimmed, context);
}
