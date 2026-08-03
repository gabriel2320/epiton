/** Read Tryton model access and probe ACL rows for the strict-mode coach. */
import type { EpitonClient, JsonObject, JsonValue } from "./index";

export interface ModelAccess {
  read: boolean;
  write: boolean;
  create: boolean;
  delete: boolean;
}

export const READ_ONLY_MODEL_ACCESS: ModelAccess = {
  read: true,
  write: false,
  create: false,
  delete: false,
};

function normalizeAccessFlag(value: JsonValue | undefined, operation: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value > 0;
  throw new Error(`ir.model.access.get_access returned an invalid ${operation} flag`);
}

/** Resolve the effective permissions Tryton computed for the current user. */
export async function getModelAccess(
  client: EpitonClient,
  model: string,
  context: JsonObject = {},
): Promise<ModelAccess> {
  const result = await client.model("ir.model.access", "get_access", [[model]], context);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("ir.model.access.get_access returned an invalid result");
  }
  const raw = (result as JsonObject)[model];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`ir.model.access.get_access omitted ${model}`);
  }
  return {
    read: normalizeAccessFlag(raw.read, "read"),
    write: normalizeAccessFlag(raw.write, "write"),
    create: normalizeAccessFlag(raw.create, "create"),
    delete: normalizeAccessFlag(raw.delete, "delete"),
  };
}

export async function modelHasAccessRows(
  client: EpitonClient,
  model: string,
): Promise<boolean | null> {
  try {
    const rows = await client.searchRead(
      "ir.model.access",
      [["model.model", "=", model]],
      ["id"],
      0,
      1,
    );
    return rows.length > 0;
  } catch {
    return null;
  }
}
