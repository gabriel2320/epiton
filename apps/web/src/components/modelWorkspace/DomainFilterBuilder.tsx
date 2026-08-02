import { Button } from "@epiton/ui";
import {
  type DomainClause,
  type DomainCombinator,
  type DomainFilter,
  type DomainOperator,
  type ViewField,
  decodeDomainFilter,
  encodeDomainFilter,
  parseDomainValue,
  parseSearchDomain,
} from "@epiton/view-engine";
import { useState } from "react";

type ClauseDraft = {
  id: number;
  field: string;
  operator: DomainOperator;
  value: string;
  target: string;
};

let clauseSequence = 0;

function nextClauseId(): number {
  clauseSequence += 1;
  return clauseSequence;
}

function defaultClause(fields: ViewField[]): ClauseDraft {
  const field = fields[0];
  return {
    id: nextClauseId(),
    field: field?.name ?? "id",
    operator: "=",
    value: field?.type === "boolean" ? "true" : "",
    target: "",
  };
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value);
}

function draftFromClause(clause: DomainClause): ClauseDraft {
  return {
    id: nextClauseId(),
    field: clause.field,
    operator: clause.operator,
    value: valueText(clause.value),
    target: clause.target ?? "",
  };
}

function operatorsFor(field: ViewField | undefined): DomainOperator[] {
  if (!field) return ["=", "!="];
  if (field.type === "boolean") return ["=", "!=", "in", "not in"];
  if (field.type === "one2many" || field.type === "many2many") {
    return ["where", "not where", "=", "!=", "in", "not in"];
  }
  if (
    field.type === "char" ||
    field.type === "text" ||
    field.type === "email" ||
    field.type === "url"
  ) {
    return ["=", "!=", "ilike", "not ilike", "like", "not like", "in", "not in"];
  }
  return [
    "=",
    "!=",
    "<",
    ">",
    "<=",
    ">=",
    "in",
    "not in",
    "child_of",
    "not child_of",
    "parent_of",
    "not parent_of",
  ];
}

function usesTarget(operator: DomainOperator): boolean {
  return (
    operator === "child_of" ||
    operator === "not child_of" ||
    operator === "parent_of" ||
    operator === "not parent_of"
  );
}

function isArrayOperator(operator: DomainOperator): boolean {
  return (
    operator === "in" ||
    operator === "not in" ||
    operator === "child_of" ||
    operator === "not child_of" ||
    operator === "parent_of" ||
    operator === "not parent_of"
  );
}

function isDomainOperator(operator: DomainOperator): boolean {
  return operator === "where" || operator === "not where";
}

function clauseValueControl(
  draft: ClauseDraft,
  field: ViewField | undefined,
  onChange: (value: string) => void,
) {
  if (!isArrayOperator(draft.operator) && !isDomainOperator(draft.operator)) {
    if (field?.type === "boolean") {
      return (
        <select
          aria-label={`Value for ${field.string ?? field.name}`}
          value={draft.value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="true">True</option>
          <option value="false">False</option>
          <option value="null">Empty (null)</option>
        </select>
      );
    }
    if (field?.type === "selection" && field.selection?.length) {
      return (
        <select
          aria-label={`Value for ${field.string ?? field.name}`}
          value={draft.value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select value…</option>
          {field.selection.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="null">Empty (null)</option>
        </select>
      );
    }
  }
  const numeric =
    !isArrayOperator(draft.operator) &&
    !isDomainOperator(draft.operator) &&
    (field?.type === "integer" ||
      field?.type === "float" ||
      field?.type === "numeric" ||
      field?.type === "progressbar" ||
      field?.type === "many2one");
  return (
    <input
      aria-label={`Value for ${field?.string ?? draft.field}`}
      type={numeric ? "number" : "text"}
      value={draft.value}
      placeholder={
        isDomainOperator(draft.operator)
          ? '[["field","=","value"]]'
          : isArrayOperator(draft.operator)
            ? '["value-1", "value-2"]'
            : "Value (or null)"
      }
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function encodeDrafts(
  combinator: DomainCombinator,
  drafts: ClauseDraft[],
  fields: ViewField[],
): { ok: true; text: string } | { ok: false; error: string } {
  const clauses: DomainClause[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    if (!draft) continue;
    const field = fields.find((candidate) => candidate.name === draft.field);
    if (!field) return { ok: false, error: `Clause ${index + 1}: choose a field` };
    const parsed = parseDomainValue(draft.value, field.type, draft.operator);
    if (!parsed.ok) return { ok: false, error: `Clause ${index + 1}: ${parsed.error}` };
    clauses.push({
      field: draft.field,
      operator: draft.operator,
      value: parsed.value,
      ...(draft.target.trim() ? { target: draft.target.trim() } : {}),
    });
  }
  try {
    return { ok: true, text: JSON.stringify(encodeDomainFilter({ combinator, clauses })) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid filter clauses",
    };
  }
}

export function builderFilterFromText(text: string): DomainFilter | null {
  const parsed = parseSearchDomain(text);
  return parsed.ok ? decodeDomainFilter(parsed.domain) : null;
}

export function DomainFilterBuilder(props: {
  fields: ViewField[];
  initialText: string;
  onChange: (text: string) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const decoded = builderFilterFromText(props.initialText);
  const [combinator, setCombinator] = useState<DomainCombinator>(decoded?.combinator ?? "AND");
  const [drafts, setDrafts] = useState<ClauseDraft[]>(
    decoded?.clauses.length ? decoded.clauses.map(draftFromClause) : [defaultClause(props.fields)],
  );
  const [error, setError] = useState<string | null>(null);

  function commit(nextCombinator: DomainCombinator, nextDrafts: ClauseDraft[]) {
    setCombinator(nextCombinator);
    setDrafts(nextDrafts);
    const result = encodeDrafts(nextCombinator, nextDrafts, props.fields);
    setError(result.ok ? null : result.error);
    props.onValidityChange(result.ok);
    if (result.ok) props.onChange(result.text);
  }

  function updateClause(id: number, patch: Partial<ClauseDraft>) {
    commit(
      combinator,
      drafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  return (
    <section className="epiton-filter-builder" aria-label="Typed domain builder">
      <div className="epiton-filter-builder-heading">
        <label>
          Match
          <select
            aria-label="Clause match"
            value={combinator}
            onChange={(event) => commit(event.target.value as DomainCombinator, drafts)}
          >
            <option value="AND">All clauses (AND)</option>
            <option value="OR">Any clause (OR)</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => commit(combinator, [...drafts, defaultClause(props.fields)])}
        >
          Add clause
        </Button>
      </div>
      <div className="epiton-filter-clauses">
        {drafts.map((draft, index) => {
          const field = props.fields.find((candidate) => candidate.name === draft.field);
          const operators = operatorsFor(field);
          return (
            <div className="epiton-filter-clause" key={draft.id}>
              <span className="epiton-filter-clause-number" aria-hidden="true">
                {index + 1}
              </span>
              <select
                aria-label={`Field for clause ${index + 1}`}
                value={draft.field}
                onChange={(event) => {
                  const nextField = props.fields.find(
                    (candidate) => candidate.name === event.target.value,
                  );
                  updateClause(draft.id, {
                    field: event.target.value,
                    operator: "=",
                    value: nextField?.type === "boolean" ? "true" : "",
                    target: "",
                  });
                }}
              >
                {props.fields.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>
                    {candidate.string ?? candidate.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Operator for clause ${index + 1}`}
                value={draft.operator}
                onChange={(event) =>
                  updateClause(draft.id, {
                    operator: event.target.value as DomainOperator,
                    value: "",
                    target: "",
                  })
                }
              >
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
              {clauseValueControl(draft, field, (value) => updateClause(draft.id, { value }))}
              {usesTarget(draft.operator) ? (
                <input
                  aria-label={`Target for clause ${index + 1}`}
                  value={draft.target}
                  placeholder="Parent/target field (optional)"
                  onChange={(event) => updateClause(draft.id, { target: event.target.value })}
                />
              ) : null}
              <Button
                variant="ghost"
                disabled={drafts.length === 1}
                aria-label={`Remove clause ${index + 1}`}
                onClick={() =>
                  commit(
                    combinator,
                    drafts.filter((item) => item.id !== draft.id),
                  )
                }
              >
                Remove
              </Button>
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="epiton-filter-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
