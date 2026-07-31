import { Button, Panel } from "@epiton/ui";
import {
  type O2MCommand,
  type RecordValues,
  type ViewField,
  toTrytonM2M,
  toTrytonO2M,
} from "@epiton/view-engine";
import { useMemo, useState } from "react";
import { RelationLineForm } from "./RelationLineForm";
import { RelationSearch } from "./RelationSearch";

/** Inline editor for One2Many / Many2Many line commands (Sao parity). */
export function RelationLinesEditor(props: {
  field: ViewField;
  value: unknown;
  mode: "read" | "write";
  recordValues?: Record<string, unknown>;
  domain?: unknown[];
  onCommit: (next: unknown) => void;
  /** Open nested related record (O2M/M2M line). */
  onOpenLine?: (model: string, id: number) => void;
}) {
  const initialIds = useMemo(() => normalizeIds(props.value), [props.value]);
  const [ids, setIds] = useState<number[]>(initialIds);
  const [draftId, setDraftId] = useState("");
  const [commands, setCommands] = useState<O2MCommand[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lineForm, setLineForm] = useState<"create" | number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  function deleteId(id: number) {
    setIds((prev) => prev.filter((x) => x !== id));
    setCommands((prev) => [...prev, { op: "delete", id }]);
  }

  function apply() {
    if (props.field.type === "many2many") {
      props.onCommit(toTrytonM2M(ids));
      return;
    }
    props.onCommit(toTrytonO2M(commands.length ? commands : ids.map((id) => ({ op: "add", id }))));
  }

  function queueLine(values: RecordValues, lineId: number | null) {
    if (lineId != null) {
      setCommands((prev) => [...prev, { op: "write", id: lineId, values }]);
      setNotice(`Write #${lineId} queued — Apply to attach`);
    } else {
      setCommands((prev) => [...prev, { op: "create", values }]);
      setNotice("Create queued — Apply to attach");
    }
    setLineForm(null);
  }

  return (
    <Panel title={`${props.field.string ?? props.field.name} (${props.field.type})`}>
      <ul className="epiton-menu-list">
        {ids.map((id) => (
          <li key={id} className="epiton-menu-row">
            <span>#{id}</span>
            {props.field.relation && props.onOpenLine ? (
              <Button onClick={() => props.onOpenLine?.(props.field.relation as string, id)}>
                Open
              </Button>
            ) : null}
            {props.mode === "write" && props.field.type === "one2many" ? (
              <Button onClick={() => setLineForm(id)}>Edit</Button>
            ) : null}
            {props.mode === "write" ? (
              <>
                <Button variant="danger" onClick={() => removeId(id)}>
                  Remove
                </Button>
                {props.field.type === "one2many" ? (
                  <Button variant="danger" onClick={() => deleteId(id)}>
                    Delete
                  </Button>
                ) : null}
              </>
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
          {props.field.type === "one2many" && props.field.relation ? (
            <Button onClick={() => setLineForm("create")}>New line</Button>
          ) : null}
          <Button variant="primary" onClick={apply}>
            Apply relation commands
          </Button>
        </div>
      ) : null}
      {lineForm != null && props.field.relation ? (
        <RelationLineForm
          model={props.field.relation}
          lineId={lineForm === "create" ? null : lineForm}
          onCancel={() => setLineForm(null)}
          onSave={queueLine}
        />
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
      {notice ? <p role="status">{notice}</p> : null}
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
