/**
 * Soft-fail persistence for expanded tree nodes (Sao ir.ui.view_tree_state).
 */

import type { EpitonClient, JsonObject } from "./index";

function parseNodes(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((n) => Number.isFinite(n));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter((n) => Number.isFinite(n));
      }
    } catch {
      return raw
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
    }
  }
  return [];
}

/** Load expanded node ids for a model. Soft-fails to []. */
export async function loadTreeState(
  client: EpitonClient,
  model: string,
  userId: number,
  context: JsonObject = {},
): Promise<number[]> {
  try {
    const rows = await client.searchRead(
      "ir.ui.view_tree_state",
      [
        ["model", "=", model],
        ["user", "=", userId],
      ],
      ["nodes", "childs", "model"],
      0,
      1,
      null,
      context,
    );
    const row = rows[0];
    if (!row) return [];
    const fromNodes = parseNodes(row.nodes);
    if (fromNodes.length) return fromNodes;
    return parseNodes(row.childs);
  } catch {
    return [];
  }
}

/** Persist expanded ids. Soft-fails false. */
export async function saveTreeState(
  client: EpitonClient,
  model: string,
  userId: number,
  nodes: number[],
  context: JsonObject = {},
): Promise<boolean> {
  const payload = JSON.stringify(nodes);
  try {
    const existing = await client.searchRead(
      "ir.ui.view_tree_state",
      [
        ["model", "=", model],
        ["user", "=", userId],
      ],
      ["id"],
      0,
      1,
      null,
      context,
    );
    const id = existing[0] ? Number(existing[0].id) : null;
    if (id != null && Number.isFinite(id)) {
      await client.model("ir.ui.view_tree_state", "write", [[id], { nodes: payload }], context);
      return true;
    }
    await client.model(
      "ir.ui.view_tree_state",
      "create",
      [[{ model, user: userId, nodes: payload }]],
      context,
    );
    return true;
  } catch {
    return false;
  }
}
