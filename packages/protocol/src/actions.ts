import type { EpitonClient } from "./index";

export type ResolvedAction =
  | { kind: "model"; model: string }
  | { kind: "wizard"; wizard: string; actionId: number | null }
  | { kind: "report"; report: string; actionId: number | null }
  | { kind: "unsupported"; ref: string; reason: string };

/**
 * Resolve a menu/action reference to a workspace model, wizard, or report.
 */
export async function resolveAction(
  client: EpitonClient,
  actionOrModel: string | null | undefined,
): Promise<ResolvedAction> {
  if (!actionOrModel) {
    return { kind: "unsupported", ref: "", reason: "empty" };
  }
  const raw = actionOrModel.trim();
  if (!raw) {
    return { kind: "unsupported", ref: "", reason: "empty" };
  }

  if (!raw.includes(",")) {
    if (raw.startsWith("ir.action")) {
      return { kind: "unsupported", ref: raw, reason: "incomplete action reference" };
    }
    if (raw.includes(".")) {
      try {
        const wizards = await client.searchRead(
          "ir.action.wizard",
          [["wiz_name", "=", raw]],
          ["id", "wiz_name"],
          0,
          1,
        );
        if (wizards[0] && typeof wizards[0].wiz_name === "string") {
          return {
            kind: "wizard",
            wizard: wizards[0].wiz_name,
            actionId: Number(wizards[0].id) || null,
          };
        }
      } catch {
        // Fall through
      }
      try {
        const reports = await client.searchRead(
          "ir.action.report",
          [["report_name", "=", raw]],
          ["id", "report_name"],
          0,
          1,
        );
        if (reports[0] && typeof reports[0].report_name === "string") {
          return {
            kind: "report",
            report: reports[0].report_name,
            actionId: Number(reports[0].id) || null,
          };
        }
      } catch {
        // Fall through to model
      }
      return { kind: "model", model: raw };
    }
    return { kind: "unsupported", ref: raw, reason: "not a model or action" };
  }

  const [type, idRaw] = raw.split(",", 2);
  const id = Number(idRaw);
  if (!type || !Number.isFinite(id)) {
    return { kind: "unsupported", ref: raw, reason: "invalid action id" };
  }

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
      if (typeof model === "string" && model.length > 0) {
        return { kind: "model", model };
      }
      return { kind: "unsupported", ref: raw, reason: "act_window missing res_model" };
    } catch {
      return { kind: "unsupported", ref: raw, reason: "act_window lookup failed" };
    }
  }

  if (type === "ir.action.wizard") {
    try {
      const rows = await client.searchRead(
        "ir.action.wizard",
        [["id", "=", id]],
        ["wiz_name"],
        0,
        1,
      );
      const wizard = rows[0]?.wiz_name;
      if (typeof wizard === "string" && wizard.length > 0) {
        return { kind: "wizard", wizard, actionId: id };
      }
      return { kind: "unsupported", ref: raw, reason: "wizard missing wiz_name" };
    } catch {
      return { kind: "unsupported", ref: raw, reason: "wizard lookup failed" };
    }
  }

  if (type === "ir.action.report") {
    try {
      const rows = await client.searchRead(
        "ir.action.report",
        [["id", "=", id]],
        ["report_name"],
        0,
        1,
      );
      const report = rows[0]?.report_name;
      if (typeof report === "string" && report.length > 0) {
        return { kind: "report", report, actionId: id };
      }
      return { kind: "unsupported", ref: raw, reason: "report missing report_name" };
    } catch {
      return { kind: "unsupported", ref: raw, reason: "report lookup failed" };
    }
  }

  return { kind: "unsupported", ref: raw, reason: `unsupported action type ${type}` };
}

/** Resolve a menu/action reference to a Tryton model name for the workspace. */
export async function resolveWorkspaceModel(
  client: EpitonClient,
  actionOrModel: string | null | undefined,
): Promise<string | null> {
  const resolved = await resolveAction(client, actionOrModel);
  return resolved.kind === "model" ? resolved.model : null;
}
