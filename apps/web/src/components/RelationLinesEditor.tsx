import { Button, Panel } from "@epiton/ui";
import { type O2MCommand, type ViewField, toTrytonM2M, toTrytonO2M } from "@epiton/view-engine";
import { useMemo, useState } from "react";
import { RelationSearch } from "./RelationSearch";

/** Inline editor for One2Many / Many2Many line commands (Sao parity). */
export function RelationLinesEditor(props: {
  field: ViewField;
  value: unknown;
  mode: "read" | "write";
  recordValues?: Record<string, unknown>;
  domain?: unknown[];
  onCommit: (next: unknown) => void;
}) {
  const initialIds = useMemo(() => normalizeIds(props.value), [props.value]);
  const [ids, setIds] = useState<number[]>(initialIds);
  const [draftId, setDraftId] = useState("");
  const [commands, setCommands] = useState<O2MCommand[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  function addId(id: number) {
    if (!Number.isFinite(id)) return;
    setIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCommands((prev) => [...prev, { op: "add", id }]);
  }

  function addFromInput() {
    addId(Number(draftId));
    setDraftId("");
  }

  function removeId(id: number) {
    setIds((prev) => prev.filter((x) => x !== id));
    setCommands((prev) => [...prev, { op: "remove", id }]);
  }

  function apply() {
    if (props.field.type === "many2many") {
      props.onCommit(toTrytonM2M(ids));
      return;
    }
    props.onCommit(toTrytonO2M(commands.length ? commands : ids.map((id) => ({ op: "add", id }))));
  }

  return (
    <Panel title={`${props.field.string ?? props.field.name} (${props.field.type})`}>
      <ul className="epiton-menu-list">
        {ids.map((id) => (
          <li key={id}>
            <span>#{id}</span>
            {props.mode === "write" ? (
              <Button variant="danger" onClick={() => removeId(id)}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {props.mode === "write" ? (
        <div className="epiton-toolbar">
          <input
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            placeholder="record id"
            aria-label="Related record id"
          />
          <Button onClick={addFromInput}>Add id</Button>
          <Button onClick={() => setSearchOpen(true)}>Search add</Button>
          <Button variant="primary" onClick={apply}>
            Apply relation commands
          </Button>
        </div>
      ) : null}
      {searchOpen && props.field.relation ? (
        <RelationSearch
          field={props.field}
          recordValues={props.recordValues ?? {}}
          domain={props.domain}
          mode={props.mode}
          onCancel={() => setSearchOpen(false)}
          onPick={(id) => {
            addId(id);
            setSearchOpen(false);
          }}
        />
      ) : null}
      <p className="text-sm text-[var(--epiton-muted)]">
        Relation: {props.field.relation ?? "—"} · pending ops: {commands.length}
      </p>
    </Panel>
  );
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "number") return item;
      if (Array.isArray(item) && typeof item[0] === "number") return item[0];
      if (item && typeof item === "object" && "id" in item)
        return Number((item as { id: unknown }).id);
      return Number.NaN;
    })
    .filter((n) => Number.isFinite(n));
}
