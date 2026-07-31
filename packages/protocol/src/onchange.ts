/**
 * Tryton on_change / on_change_with helpers (Sao-shaped RPC).
 * Original Epiton — builds argument bags and merges result maps.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type OnChangeValues = Record<string, unknown>;

export interface FieldOnChangeMeta {
  name: string;
  on_change?: string[];
  on_change_with?: string[];
}

export interface OnChangeClient {
  model(
    model: string,
    method: string,
    params: JsonValue[],
    context?: JsonObject,
  ): Promise<JsonValue>;
}

/** Collect field values for on_change / on_change_with RPC args. */
export function buildOnChangeArgs(values: OnChangeValues, fieldNames: string[]): JsonObject {
  const out: JsonObject = {};
  for (const name of fieldNames) {
    if (name === "id" && values.id != null) {
      out.id = Number(values.id) as JsonValue;
      continue;
    }
    if (!(name in values)) continue;
    const raw = values[name];
    if (Array.isArray(raw) && raw.length >= 1) {
      out[name] = (raw[0] ?? null) as JsonValue;
    } else {
      out[name] = raw as JsonValue;
    }
  }
  if (values.id != null && out.id === undefined) {
    out.id = Number(values.id) as JsonValue;
  }
  return out;
}

function asObject(value: unknown): OnChangeValues {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as OnChangeValues)
    : {};
}

/**
 * Run on_change for a changed field, then on_change_with for dependents.
 * Returns a merged patch to apply onto the draft.
 */
export async function applyFieldChange(
  client: OnChangeClient,
  model: string,
  fields: Record<string, FieldOnChangeMeta>,
  values: OnChangeValues,
  changedField: string,
  context: JsonObject = {},
): Promise<OnChangeValues> {
  const patch: OnChangeValues = {};
  const changedMeta = fields[changedField];

  const onChangeDeps = changedMeta?.on_change ?? [];
  if (onChangeDeps.length > 0) {
    const argNames = [...new Set(["id", changedField, ...onChangeDeps])];
    const args = buildOnChangeArgs(values, argNames);
    try {
      const result = await client.model(model, `on_change_${changedField}`, [args], context);
      Object.assign(patch, asObject(result));
    } catch {
      // Model may not implement the method — soft-fail.
    }
  }

  const dependents = Object.values(fields).filter(
    (f) => f.name !== changedField && (f.on_change_with ?? []).includes(changedField),
  );

  if (dependents.length === 0) return patch;

  const mergedValues = { ...values, ...patch };
  if (dependents.length === 1) {
    const dep = dependents[0];
    if (!dep) return patch;
    const argNames = [...new Set(["id", dep.name, ...(dep.on_change_with ?? [])])];
    const args = buildOnChangeArgs(mergedValues, argNames);
    try {
      const result = await client.model(model, `on_change_with_${dep.name}`, [args], context);
      if (result && typeof result === "object" && !Array.isArray(result)) {
        Object.assign(patch, asObject(result));
      } else if (result !== undefined) {
        patch[dep.name] = result;
      }
    } catch {
      // soft-fail
    }
    return patch;
  }

  const names = dependents.map((d) => d.name);
  const allDeps = [
    ...new Set(["id", ...names, ...dependents.flatMap((d) => d.on_change_with ?? [])]),
  ];
  const args = buildOnChangeArgs(mergedValues, allDeps);
  try {
    const result = await client.model(model, "on_change_with", [args, names], context);
    Object.assign(patch, asObject(result));
  } catch {
    for (const dep of dependents) {
      const argNames = [...new Set(["id", dep.name, ...(dep.on_change_with ?? [])])];
      try {
        const result = await client.model(
          model,
          `on_change_with_${dep.name}`,
          [buildOnChangeArgs(mergedValues, argNames)],
          context,
        );
        if (result && typeof result === "object" && !Array.isArray(result)) {
          Object.assign(patch, asObject(result));
        } else if (result !== undefined) {
          patch[dep.name] = result;
        }
      } catch {
        // soft-fail per field
      }
    }
  }

  return patch;
}
