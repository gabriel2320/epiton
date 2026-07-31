import type { EpitonClient } from "./index";

/**
 * Resolve a menu/action reference to a Tryton model name for the workspace.
 * Accepts bare model names (`party.party`) or references (`ir.action.act_window,12`).
 */
export async function resolveWorkspaceModel(
  client: EpitonClient,
  actionOrModel: string | null | undefined,
): Promise<string | null> {
  if (!actionOrModel) return null;
  const raw = actionOrModel.trim();
  if (!raw) return null;

  if (!raw.includes(",")) {
    if (raw.startsWith("ir.action")) return null;
    // Favorites and command palette often pass model names directly.
    if (raw.includes(".")) return raw;
    return null;
  }

  const [type, idRaw] = raw.split(",", 2);
  const id = Number(idRaw);
  if (!type || !Number.isFinite(id)) return null;

  if (type === "ir.action.act_window") {
    try {
      const rows = await client.searchRead(
        "ir.action.act_window",
        [["id", "=", id]],
        ["res_model"],
        0,
        1,
      );
      const model = rows[0]?.res_model;
      return typeof model === "string" && model.length > 0 ? model : null;
    } catch {
      return null;
    }
  }

  return null;
}
