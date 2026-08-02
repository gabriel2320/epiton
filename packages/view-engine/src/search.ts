import type { FieldType } from "./parse";

export const DOMAIN_OPERATORS = [
  "=",
  "!=",
  "like",
  "not like",
  "ilike",
  "not ilike",
  "in",
  "not in",
  "<",
  ">",
  "<=",
  ">=",
  "child_of",
  "not child_of",
  "parent_of",
  "not parent_of",
  "where",
  "not where",
] as const;

export type DomainOperator = (typeof DOMAIN_OPERATORS)[number];
export type DomainCombinator = "AND" | "OR";

export type DomainClause = {
  field: string;
  operator: DomainOperator;
  value: unknown;
  /** Optional Tryton target/parent field used by reference and hierarchy clauses. */
  target?: string;
};

export type DomainFilter = {
  combinator: DomainCombinator;
  clauses: DomainClause[];
};

export type SearchDomainResult =
  | { ok: true; domain: unknown[]; kind: "empty" | "id" | "text" | "raw" }
  | { ok: false; error: string };

const DOMAIN_OPERATOR_SET = new Set<string>(DOMAIN_OPERATORS);
const ARRAY_VALUE_OPERATORS = new Set<DomainOperator>([
  "in",
  "not in",
  "child_of",
  "not child_of",
  "parent_of",
  "not parent_of",
]);
const DOMAIN_VALUE_OPERATORS = new Set<DomainOperator>(["where", "not where"]);

function domainError(path: string, message: string): string {
  return `${path}: ${message}`;
}

function isDomainOperator(value: unknown): value is DomainOperator {
  return typeof value === "string" && DOMAIN_OPERATOR_SET.has(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value == null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function validateClause(value: unknown[], path: string): string | null {
  if (value.length !== 3 && value.length !== 4) {
    return domainError(path, "a clause needs field, operator, value, and optional target");
  }
  if (typeof value[0] !== "string" || !value[0].trim()) {
    return domainError(`${path}[0]`, "field must be a non-empty string");
  }
  if (!isDomainOperator(value[1])) {
    return domainError(`${path}[1]`, `unsupported operator ${JSON.stringify(value[1])}`);
  }
  if (value.length === 4 && (typeof value[3] !== "string" || !value[3].trim())) {
    return domainError(`${path}[3]`, "target must be a non-empty string");
  }
  if (ARRAY_VALUE_OPERATORS.has(value[1]) && !Array.isArray(value[2])) {
    return domainError(`${path}[2]`, `${value[1]} requires an array value`);
  }
  if (DOMAIN_VALUE_OPERATORS.has(value[1])) {
    if (!Array.isArray(value[2])) {
      return domainError(`${path}[2]`, `${value[1]} requires a nested domain`);
    }
    const nestedError = validateDomainNode(value[2], `${path}[2]`, false);
    if (nestedError) return nestedError;
  } else if (!isJsonValue(value[2])) {
    return domainError(`${path}[2]`, "value must be JSON-compatible");
  }
  return null;
}

function validateDomainNode(value: unknown, path: string, allowEmpty: boolean): string | null {
  if (!Array.isArray(value)) return domainError(path, "domain node must be an array");
  if (!value.length) return allowEmpty ? null : domainError(path, "nested domain cannot be empty");

  if (typeof value[0] === "string" && value[0] !== "AND" && value[0] !== "OR") {
    return domainError(path, "domain must contain clauses or start with AND/OR");
  }

  const start = value[0] === "AND" || value[0] === "OR" ? 1 : 0;
  if (start === 1 && value.length === 1) {
    return domainError(path, `${value[0]} needs at least one clause`);
  }
  for (let index = start; index < value.length; index += 1) {
    const operand = value[index];
    const operandPath = `${path}[${index}]`;
    const error =
      Array.isArray(operand) &&
      typeof operand[0] === "string" &&
      operand[0] !== "AND" &&
      operand[0] !== "OR"
        ? validateClause(operand, operandPath)
        : validateDomainNode(operand, operandPath, false);
    if (error) return error;
  }
  return null;
}

/** Validate the documented Tryton domain/clauses structure without evaluating it. */
export function validateTrytonDomain(value: unknown): { ok: true } | { ok: false; error: string } {
  const error = validateDomainNode(value, "domain", true);
  return error ? { ok: false, error } : { ok: true };
}

function toClause(value: unknown[]): DomainClause {
  return {
    field: String(value[0]),
    operator: value[1] as DomainOperator,
    value: value[2],
    ...(typeof value[3] === "string" ? { target: value[3] } : {}),
  };
}

function clauseArray(clause: DomainClause): unknown[] {
  const value: unknown[] = [clause.field.trim(), clause.operator, clause.value];
  if (clause.target?.trim()) value.push(clause.target.trim());
  return value;
}

/** Encode the flat typed builder into an implicit AND or explicit OR Tryton domain. */
export function encodeDomainFilter(filter: DomainFilter): unknown[] {
  const clauses = filter.clauses.map(clauseArray);
  const domain: unknown[] =
    filter.combinator === "OR" && clauses.length ? ["OR", ...clauses] : clauses;
  const result = validateTrytonDomain(domain);
  if (!result.ok) throw new Error(result.error);
  return domain;
}

/** Decode domains representable by the flat typed builder; nested domains remain raw JSON. */
export function decodeDomainFilter(value: unknown): DomainFilter | null {
  const validation = validateTrytonDomain(value);
  if (!validation.ok || !Array.isArray(value)) return null;

  let domain = value;
  if (
    domain.length === 1 &&
    Array.isArray(domain[0]) &&
    (domain[0][0] === "AND" || domain[0][0] === "OR")
  ) {
    domain = domain[0];
  }
  const explicit = domain[0] === "AND" || domain[0] === "OR";
  const clauseValues = explicit ? domain.slice(1) : domain;
  if (
    !clauseValues.every(
      (clause) => Array.isArray(clause) && validateClause(clause, "clause") == null,
    )
  ) {
    return null;
  }
  return {
    combinator: explicit ? (domain[0] as DomainCombinator) : "AND",
    clauses: clauseValues.map((clause) => toClause(clause as unknown[])),
  };
}

/** Parse a typed clause input according to its operator and Tryton field type. */
export function parseDomainValue(
  input: string,
  fieldType: FieldType,
  operator: DomainOperator,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const value = input.trim();
  if (value === "null") return { ok: true, value: null };
  if (ARRAY_VALUE_OPERATORS.has(operator)) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, error: `${operator} requires a JSON array` };
    } catch {
      return { ok: false, error: `${operator} requires a valid JSON array` };
    }
  }
  if (DOMAIN_VALUE_OPERATORS.has(operator)) {
    try {
      const parsed = JSON.parse(value) as unknown;
      const validation = validateTrytonDomain(parsed);
      return validation.ok ? { ok: true, value: parsed } : { ok: false, error: validation.error };
    } catch {
      return { ok: false, error: `${operator} requires a valid JSON domain` };
    }
  }
  if (fieldType === "boolean") {
    if (value === "true") return { ok: true, value: true };
    if (value === "false") return { ok: true, value: false };
    return { ok: false, error: "Boolean value must be true, false, or null" };
  }
  if (
    fieldType === "integer" ||
    fieldType === "float" ||
    fieldType === "numeric" ||
    fieldType === "progressbar" ||
    fieldType === "many2one"
  ) {
    const numeric = Number(value);
    return value && Number.isFinite(numeric)
      ? { ok: true, value: numeric }
      : { ok: false, error: "Value must be a finite number or null" };
  }
  if (!value) return { ok: false, error: "Value is required (use null for an empty value)" };
  return { ok: true, value: input };
}

/** Parse free text, numeric ids, or strict raw JSON domains before any RPC is enabled. */
export function parseSearchDomain(
  query: string,
  fields: string[] = ["rec_name", "name", "code"],
): SearchDomainResult {
  const term = query.trim();
  if (!term) return { ok: true, domain: [], kind: "empty" };
  if (term.startsWith("[") || term.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(term) as unknown;
    } catch {
      return { ok: false, error: "Raw domain must be valid JSON" };
    }
    const validation = validateTrytonDomain(parsed);
    return validation.ok
      ? { ok: true, domain: parsed as unknown[], kind: "raw" }
      : { ok: false, error: validation.error };
  }
  if (/^\d+$/.test(term)) {
    return { ok: true, domain: [["id", "=", Number(term)]], kind: "id" };
  }
  const safeFields = fields.filter((field) => field.trim());
  if (!safeFields.length) return { ok: false, error: "No searchable fields are available" };
  if (safeFields.length === 1) {
    return {
      ok: true,
      domain: [[safeFields[0], "ilike", `%${term}%`]],
      kind: "text",
    };
  }
  return {
    ok: true,
    domain: [["OR", ...safeFields.map((field) => [field, "ilike", `%${term}%`])]],
    kind: "text",
  };
}

/** Build a simple Tryton domain from a user search string. */
export function buildSearchDomain(
  query: string,
  fields: string[] = ["rec_name", "name", "code"],
): unknown[] {
  const result = parseSearchDomain(query, fields);
  if (!result.ok) throw new Error(result.error);
  return result.domain;
}

/** Merge action domain with user search domain. */
export function mergeDomains(base: unknown[] | undefined, extra: unknown[]): unknown[] {
  const a = Array.isArray(base) ? base : [];
  const b = Array.isArray(extra) ? extra : [];
  if (!a.length) return b;
  if (!b.length) return a;
  return [...a, ...b];
}

/** Format Tryton order string from column sort state. */
export function formatOrder(sorts: Array<{ id: string; desc: boolean }>): string | null {
  if (!sorts.length) return null;
  return sorts.map((s) => `${s.id} ${s.desc ? "DESC" : "ASC"}`).join(", ");
}
