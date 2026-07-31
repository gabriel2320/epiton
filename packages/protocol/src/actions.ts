import type { EpitonClient, JsonObject, JsonValue } from "./index";

export type ResolvedAction =
  | {
      kind: "model";
      model: string;
      actionId?: number | null;
      name?: string;
      /** Concrete or PYSON-encoded domain from act_window. */
      domain?: JsonValue;
      /** Dict or PYSON-encoded context string from act_window. */
      context?: JsonValue;
      views?: Array<[number | null, string]>;
    }
  | { kind: "wizard"; wizard: string; actionId: number | null }
  | { kind: "report"; report: string; actionId: number | null }
  | { kind: "unsupported"; ref: string; reason: string };

function asObject(value: unknown): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
}

function parseDomainField(raw: unknown): JsonValue | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw as JsonValue;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || t === "[]") return [];
    try {
      return JSON.parse(t) as JsonValue;
    } catch {
      try {
        return JSON.parse(t.replace(/'/g, '"')) as JsonValue;
      } catch {
        return undefined;
      }
    }
  }
  return raw as JsonValue;
}

function parseViews(raw: unknown): Array<[number | null, string]> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Array<[number | null, string]> = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const id = item[0] == null ? null : Number(item[0]);
    const mode = String(item[1] ?? "form");
    out.push([Number.isFinite(id as number) ? (id as number) : null, mode]);
  }
  return out.length ? out : undefined;
}

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
        ["res_model", "name", "domain", "context", "views"],
        0,
        1,
      );
      const row = rows[0];
      const model = row?.res_model;
      if (typeof model === "string" && model.length > 0) {
        return {
          kind: "model",
          model,
          actionId: id,
          name: typeof row?.name === "string" ? row.name : undefined,
          domain: parseDomainField(row?.domain),
          context: parseDomainField(row?.context) ?? asObject(row?.context),
          views: parseViews(row?.views),
        };
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
