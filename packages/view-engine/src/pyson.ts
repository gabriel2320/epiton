/**
 * Minimal PYSON-ish evaluator for common Tryton view states.
 * Supports only boolean literals, Equality/Not/And/Or/Eval of simple field refs.
 * Does NOT execute arbitrary Python — unknown expressions default to visible/editable.
 */

export type PysonContext = Record<string, unknown>;

export interface FieldStates {
  invisible?: boolean;
  readonly?: boolean;
  required?: boolean;
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 && value[0] != null;
  return Boolean(value);
}

/** Evaluate a tiny subset of PYSON encoded as JSON-like strings from view attrs. */
export function evalPyson(expr: string | undefined, ctx: PysonContext): boolean | null {
  if (expr == null || expr.trim() === "") return null;
  const raw = expr.trim();

  if (raw === "True" || raw === "true") return true;
  if (raw === "False" || raw === "false") return false;

  // Eval('field', default)
  const evalMatch = /^Eval\(\s*'([^']+)'\s*(?:,\s*([^)]+))?\s*\)$/.exec(raw);
  if (evalMatch?.[1]) {
    const key = evalMatch[1];
    if (key in ctx) return truthy(ctx[key]);
    if (evalMatch[2] != null) {
      const d = evalMatch[2].trim();
      if (d === "True" || d === "true") return true;
      if (d === "False" || d === "false") return false;
    }
    return false;
  }

  // Not(Eval('field'))
  const notEval = /^Not\(\s*Eval\(\s*'([^']+)'\s*\)\s*\)$/.exec(raw);
  if (notEval?.[1]) {
    return !truthy(ctx[notEval[1]]);
  }

  // Bool(Eval('field'))
  const boolEval = /^Bool\(\s*Eval\(\s*'([^']+)'\s*\)\s*\)$/.exec(raw);
  if (boolEval?.[1]) {
    return truthy(ctx[boolEval[1]]);
  }

  // Equal(Eval('field'), True/False/'x')
  const equal = /^Equal\(\s*Eval\(\s*'([^']+)'\s*\)\s*,\s*(.+)\s*\)$/i.exec(raw);
  if (equal?.[1] && equal[2]) {
    const left = ctx[equal[1]];
    let rightRaw = equal[2].trim();
    if (
      (rightRaw.startsWith("'") && rightRaw.endsWith("'")) ||
      (rightRaw.startsWith('"') && rightRaw.endsWith('"'))
    ) {
      rightRaw = rightRaw.slice(1, -1);
      return String(Array.isArray(left) ? left[0] : left) === rightRaw;
    }
    if (rightRaw === "True" || rightRaw === "true") return truthy(left) === true;
    if (rightRaw === "False" || rightRaw === "false") return truthy(left) === false;
  }

  // Unknown — do not hide/lock by default
  return null;
}

/** Parse states="{...}" attribute; returns resolved flags for current values. */
export function resolveStatesAttr(
  statesAttr: string | undefined,
  values: PysonContext,
): FieldStates {
  if (!statesAttr) return {};
  const result: FieldStates = {};
  for (const key of ["invisible", "readonly", "required"] as const) {
    const keyIdx = statesAttr.search(new RegExp(`['"]?${key}['"]?\\s*:`));
    if (keyIdx < 0) continue;
    const afterColon = statesAttr.slice(keyIdx).indexOf(":");
    if (afterColon < 0) continue;
    let i = keyIdx + afterColon + 1;
    while (i < statesAttr.length && /\s/.test(statesAttr[i] ?? "")) i += 1;
    let depth = 0;
    let end = i;
    for (; end < statesAttr.length; end += 1) {
      const ch = statesAttr[end];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if ((ch === "," || ch === "}") && depth === 0) break;
    }
    const expr = statesAttr.slice(i, end).trim();
    const evaluated = evalPyson(expr, values);
    if (evaluated != null) result[key] = evaluated;
  }
  return result;
}
