/**
 * Tryton PYSON evaluator (JSON wire format with `__class__`).
 * Original Epiton implementation — does not execute Python.
 * Unknown nodes return null / pass-through so views stay usable.
 */

export type PysonContext = Record<string, unknown>;
export type PysonNode = unknown;

export interface FieldStates {
  invisible?: boolean;
  readonly?: boolean;
  required?: boolean;
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 && value[0] != null && value[0] !== false;
  return Boolean(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolvePath(ctx: PysonContext, path: string): unknown {
  if (path in ctx) return ctx[path];
  if (path.startsWith("_parent_")) {
    const rest = path.slice("_parent_".length);
    const parent = asRecord(ctx._parent_);
    if (parent && rest in parent) return parent[rest];
  }
  const dot = path.indexOf(".");
  if (dot > 0) {
    const head = path.slice(0, dot);
    const tail = path.slice(dot + 1);
    const base = ctx[head];
    if (Array.isArray(base) && base.length >= 2 && typeof base[1] === "object") {
      return (base[1] as Record<string, unknown>)[tail];
    }
    const obj = asRecord(base);
    if (obj) return obj[tail];
  }
  return undefined;
}

/** Evaluate a PYSON JSON node (or Python-ish string fallback). */
export function evalPysonNode(node: PysonNode, ctx: PysonContext): unknown {
  if (node == null) return null;
  if (typeof node === "boolean" || typeof node === "number") return node;
  if (typeof node === "string") {
    // Wire-format strings are literals (domain field names, operators, constants).
    // Attr-style expressions like Eval('x') go through evalPyson() → evalPysonString.
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((n) => evalPysonNode(n, ctx));
  }
  const obj = asRecord(node);
  if (!obj) return node;
  const cls = obj.__class__;
  if (typeof cls !== "string") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = evalPysonNode(v, ctx);
    return out;
  }

  switch (cls) {
    case "Eval": {
      const path = String(obj.v ?? "");
      const found = resolvePath(ctx, path);
      return found === undefined ? (obj.d ?? "") : found;
    }
    case "Not":
      return !truthy(evalPysonNode(obj.v, ctx));
    case "Bool":
      return truthy(evalPysonNode(obj.v, ctx));
    case "And": {
      const stmts = Array.isArray(obj.s) ? obj.s : [];
      return stmts.every((s) => truthy(evalPysonNode(s, ctx)));
    }
    case "Or": {
      const stmts = Array.isArray(obj.s) ? obj.s : [];
      return stmts.some((s) => truthy(evalPysonNode(s, ctx)));
    }
    case "equal":
    case "Equal": {
      const left = evalPysonNode(obj.s1 ?? obj.v1, ctx);
      const right = evalPysonNode(obj.s2 ?? obj.v2, ctx);
      const norm = (v: unknown) => (Array.isArray(v) ? v[0] : v);
      return norm(left) === norm(right);
    }
    case "Greater": {
      const left = Number(evalPysonNode(obj.s1, ctx));
      const right = Number(evalPysonNode(obj.s2, ctx));
      return obj.e ? left >= right : left > right;
    }
    case "Less": {
      const left = Number(evalPysonNode(obj.s1, ctx));
      const right = Number(evalPysonNode(obj.s2, ctx));
      return obj.e ? left <= right : left < right;
    }
    case "If":
      return truthy(evalPysonNode(obj.c, ctx))
        ? evalPysonNode(obj.t, ctx)
        : evalPysonNode(obj.e, ctx);
    case "Get": {
      const container = evalPysonNode(obj.v, ctx);
      const key = String(evalPysonNode(obj.k, ctx));
      const rec = asRecord(container);
      if (rec && key in rec) return rec[key];
      return obj.d ?? null;
    }
    case "In": {
      // Tryton/Sao: k = needle, v = container (list/dict/string)
      const needle = evalPysonNode(obj.k, ctx);
      const hay = evalPysonNode(obj.v, ctx);
      if (typeof hay === "string") return hay.includes(String(needle));
      if (Array.isArray(hay)) {
        const n = Array.isArray(needle) ? needle[0] : needle;
        return hay.some((h) => (Array.isArray(h) ? h[0] : h) === n || h === needle);
      }
      const rec = asRecord(hay);
      if (rec) return String(needle) in rec;
      return false;
    }
    case "Date": {
      const y = Number(evalPysonNode(obj.y, ctx) ?? new Date().getFullYear());
      const m = Number(evalPysonNode(obj.M, ctx) ?? new Date().getMonth() + 1);
      const d = Number(evalPysonNode(obj.d, ctx) ?? new Date().getDate());
      return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    case "DateTime": {
      const date = evalPysonNode({ __class__: "Date", y: obj.y, M: obj.M, d: obj.d }, ctx);
      const h = Number(evalPysonNode(obj.h, ctx) ?? 0);
      const mi = Number(evalPysonNode(obj.m, ctx) ?? 0);
      const s = Number(evalPysonNode(obj.s, ctx) ?? 0);
      return `${date} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    case "Len": {
      const v = evalPysonNode(obj.v, ctx);
      if (typeof v === "string" || Array.isArray(v)) return v.length;
      const rec = asRecord(v);
      return rec ? Object.keys(rec).length : 0;
    }
    case "Add":
    case "Sub":
    case "Mul":
    case "Div": {
      const left = Number(evalPysonNode(obj.s1 ?? obj.v1 ?? obj.v, ctx));
      const right = Number(evalPysonNode(obj.s2 ?? obj.v2 ?? obj.d, ctx));
      if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
      if (cls === "Add") return left + right;
      if (cls === "Sub") return left - right;
      if (cls === "Mul") return left * right;
      if (right === 0) return null;
      return left / right;
    }
    case "Id": {
      // Sao Id(module, xml_id) — without a catalog, return default or null.
      if (obj.d !== undefined) return evalPysonNode(obj.d, ctx);
      return null;
    }
    default:
      return null;
  }
}

/** Boolean eval for states attrs (string or JSON). */
export function evalPyson(expr: string | undefined, ctx: PysonContext): boolean | null {
  if (expr == null || expr.trim() === "") return null;
  const raw = expr.trim();
  if (raw === "True" || raw === "true") return true;
  if (raw === "False" || raw === "false") return false;

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as PysonNode;
      const result = evalPysonNode(parsed, ctx);
      if (typeof result === "boolean") return result;
      if (result === null) return null;
      return truthy(result);
    } catch {
      // fall through to string patterns
    }
  }

  return evalPysonString(raw, ctx);
}

function evalPysonString(raw: string, ctx: PysonContext): boolean | null {
  const evalMatch = /^Eval\(\s*'([^']+)'\s*(?:,\s*([^)]+))?\s*\)$/.exec(raw);
  if (evalMatch?.[1]) {
    const found = resolvePath(ctx, evalMatch[1]);
    if (found !== undefined) return truthy(found);
    if (evalMatch[2] != null) {
      const d = evalMatch[2].trim();
      if (d === "True" || d === "true") return true;
      if (d === "False" || d === "false") return false;
    }
    return false;
  }

  const notEval = /^Not\(\s*(.+)\s*\)$/.exec(raw);
  if (notEval?.[1]) {
    const inner = evalPyson(notEval[1], ctx);
    return inner == null ? null : !inner;
  }

  const boolEval = /^Bool\(\s*(.+)\s*\)$/.exec(raw);
  if (boolEval?.[1]) {
    const inner = evalPyson(boolEval[1], ctx);
    return inner == null ? null : inner;
  }

  const andMatch = /^And\(\s*(.+)\s*\)$/.exec(raw);
  if (andMatch?.[1]) {
    const parts = splitTopLevelArgs(andMatch[1]);
    const vals = parts.map((p) => evalPyson(p, ctx));
    if (vals.some((v) => v == null)) return null;
    return vals.every(Boolean);
  }

  const orMatch = /^Or\(\s*(.+)\s*\)$/.exec(raw);
  if (orMatch?.[1]) {
    const parts = splitTopLevelArgs(orMatch[1]);
    const vals = parts.map((p) => evalPyson(p, ctx));
    if (vals.every((v) => v == null)) return null;
    return vals.some(Boolean);
  }

  const ifMatch = /^If\(\s*(.+)\s*\)$/.exec(raw);
  if (ifMatch?.[1]) {
    const parts = splitTopLevelArgs(ifMatch[1]);
    if (parts.length >= 3) {
      const cond = evalPyson(parts[0], ctx);
      if (cond == null) return null;
      return cond ? evalPyson(parts[1], ctx) : evalPyson(parts[2], ctx);
    }
  }

  const equal = /^[Ee]qual\(\s*Eval\(\s*'([^']+)'\s*\)\s*,\s*(.+)\s*\)$/.exec(raw);
  if (equal?.[1] && equal[2]) {
    const left = resolvePath(ctx, equal[1]);
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

  const inMatch = /^In\(\s*(.+)\s*,\s*(.+)\s*\)$/.exec(raw);
  if (inMatch?.[1] && inMatch?.[2]) {
    const result = evalPysonNode(
      {
        __class__: "In",
        k: tryParseArg(inMatch[1]),
        v: tryParseArg(inMatch[2]),
      },
      ctx,
    );
    return Boolean(result);
  }

  return null;
}

function tryParseArg(raw: string): PysonNode {
  const t = raw.trim();
  if (t.startsWith("Eval(")) {
    const m = /^Eval\(\s*'([^']+)'\s*(?:,\s*(.+))?\s*\)$/.exec(t);
    if (m) return { __class__: "Eval", v: m[1], d: "" };
  }
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  if (t.startsWith("[")) {
    try {
      return JSON.parse(t.replace(/'/g, '"'));
    } catch {
      return t;
    }
  }
  if (t === "True") return true;
  if (t === "False") return false;
  return t;
}

function splitTopLevelArgs(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(src.slice(start).trim());
  return parts.filter(Boolean);
}

/** Decode domain (possibly PYSON-encoded JSON) against context → concrete domain list. */
export function evalDomain(domain: unknown, ctx: PysonContext): unknown[] {
  const evaluated = evalPysonNode(domain, ctx);
  return Array.isArray(evaluated) ? evaluated : [];
}

/** Evaluate a PYSON/JSON context dict against session values. */
export function evalContext(contextNode: unknown, ctx: PysonContext): Record<string, unknown> {
  let node = contextNode;
  if (typeof node === "string") {
    const t = node.trim();
    if (!t || t === "{}") return {};
    try {
      node = JSON.parse(t);
    } catch {
      try {
        node = JSON.parse(
          t
            .replace(/'/g, '"')
            .replace(/\bTrue\b/g, "true")
            .replace(/\bFalse\b/g, "false")
            .replace(/\bNone\b/g, "null"),
        );
      } catch {
        return {};
      }
    }
  }
  const evaluated = evalPysonNode(node, ctx);
  if (evaluated && typeof evaluated === "object" && !Array.isArray(evaluated)) {
    return evaluated as Record<string, unknown>;
  }
  return {};
}

/** Parse states="{...}" attribute; returns resolved flags for current values. */
export function resolveStatesAttr(statesAttr: unknown, values: PysonContext): FieldStates {
  if (!statesAttr) return {};
  const statesObject = asRecord(statesAttr);
  if (statesObject) {
    const result: FieldStates = {};
    for (const key of ["invisible", "readonly", "required"] as const) {
      if (!(key in statesObject)) continue;
      const value = evalPysonNode(statesObject[key], values);
      if (typeof value === "boolean") result[key] = value;
      else if (value != null) result[key] = truthy(value);
    }
    return result;
  }
  if (typeof statesAttr !== "string") return {};
  const trimmed = statesAttr.trim();
  if (trimmed.startsWith("{")) {
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        parsed = JSON.parse(
          trimmed
            .replace(/'/g, '"')
            .replace(/\bTrue\b/g, "true")
            .replace(/\bFalse\b/g, "false")
            .replace(/\bNone\b/g, "null"),
        ) as Record<string, unknown>;
      }
      const result: FieldStates = {};
      for (const key of ["invisible", "readonly", "required"] as const) {
        if (!(key in parsed)) continue;
        const v = evalPysonNode(parsed[key], values);
        if (typeof v === "boolean") result[key] = v;
        else if (v != null) result[key] = truthy(v);
      }
      return result;
    } catch {
      // fall through to legacy string parser
    }
  }

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
