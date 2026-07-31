/**
 * Soft-fail persistence for expanded tree nodes (Sao ir.ui.view_tree_state).
 * Keys by model + user + domain (JSON) so distinct act_windows do not collide.
 */

import type { EpitonClient, JsonObject } from "./index";

/** Stable domain key matching Sao's Char `domain` on view_tree_state. */
export function serializeTreeDomain(domain: unknown): string {
  try {
    return JSON.stringify(domain ?? []);
  } catch {
    return "[]";
  }
}

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

function domainClause(model: string, userId: number, domainKey: string): unknown[] {
  return [
    ["model", "=", model],
    ["user", "=", userId],
    ["domain", "=", domainKey],
  ];
}

/** Load expanded node ids for a model+domain. Soft-fails to []. */
export async function loadTreeState(
  client: EpitonClient,
  model: string,
  userId: number,
  context: JsonObject = {},
  domain: unknown = [],
): Promise<number[]> {
  const domainKey = serializeTreeDomain(domain);
  try {
    const rows = await client.searchRead(
      "ir.ui.view_tree_state",
      domainClause(model, userId, domainKey) as never[],
      ["nodes", "childs", "model", "domain"],
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

/** Persist expanded ids for model+domain. Soft-fails false. */
export async function saveTreeState(
  client: EpitonClient,
  model: string,
  userId: number,
  nodes: number[],
  context: JsonObject = {},
  domain: unknown = [],
): Promise<boolean> {
  const payload = JSON.stringify(nodes);
  const domainKey = serializeTreeDomain(domain);
  try {
    const existing = await client.searchRead(
      "ir.ui.view_tree_state",
      domainClause(model, userId, domainKey) as never[],
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
      [[{ model, user: userId, domain: domainKey, nodes: payload }]],
      context,
    );
    return true;
  } catch {
    return false;
  }
}
