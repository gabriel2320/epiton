import { Button, Panel } from "@epiton/ui";
import {
  type O2MCommand,
  type ParsedView,
  type RecordValues,
  type RelationCommandQueue,
  type ViewField,
  createRelationQueue,
  parseFieldsViewGet,
  relationQueueWireValue,
  treeColumns,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import { BoardTree } from "./BoardTree";
import { RelationLineForm } from "./RelationLineForm";
import { RelationSearch } from "./RelationSearch";

type LineFormTarget =
  | { kind: "new" }
  | { kind: "edit"; id: number }
  | { kind: "queued"; commandIndex: number }
  | null;

/** Inline editor for One2Many / Many2Many line commands (Sao-style tree + form). */
export function RelationLinesEditor(props: {
  field: ViewField;
  value: unknown;
  mode: "read" | "write";
  recordValues?: Record<string, unknown>;
  domain?: unknown[];
  /** Parent-owned queue when the editor participates in a Screen lifecycle. */
  queue?: RelationCommandQueue;
  onQueueChange?: (update: (current: RelationCommandQueue) => RelationCommandQueue) => void;
  /** Serialized Tryton tuples for legacy/uncontrolled hosts and explicit apply. */
  onCommit: (next: unknown) => void;
  /** Open nested related record (O2M/M2M line). */
  onOpenLine?: (model: string, id: number) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const relation = props.field.relation;
  const relationKind = props.field.type === "many2many" ? "many2many" : "one2many";
  const initialQueue = useMemo(
    () => createRelationQueue(relationKind, props.value),
    [props.value, relationKind],
  );
  const [localQueue, setLocalQueue] = useState<RelationCommandQueue>(initialQueue);
  const isControlled = props.queue != null && props.onQueueChange != null;
  const queue = isControlled && props.queue ? props.queue : localQueue;
  const { ids, commands } = queue;
  const [searchOpen, setSearchOpen] = useState(false);
  const [lineForm, setLineForm] = useState<LineFormTarget>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isControlled) return;
    setLocalQueue(initialQueue);
    setSelectedId(null);
    setLineForm(null);
  }, [initialQueue, isControlled]);

  function updateQueue(update: (current: RelationCommandQueue) => RelationCommandQueue) {
    if (isControlled) {
      props.onQueueChange?.(update);
      return;
    }
    setLocalQueue(update);
  }

  const treeViewQuery = useQuery({
    queryKey: ["relation-lines-tree", relation],
    enabled: Boolean(client && relation),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParsedView | null> => {
      if (!client || !relation) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(relation, null, "tree", sessionContext),
        );
      } catch {
        return null;
      }
    },
  });

  const columns = useMemo(() => {
    if (treeViewQuery.data) {
      const cols = treeColumns(treeViewQuery.data).slice(0, 5);
      if (cols.length) return cols.map((c) => ({ name: c.name, string: c.string }));
    }
    return [
      { name: "rec_name", string: "Name" },
      { name: "id", string: "ID" },
    ];
  }, [treeViewQuery.data]);

  const fieldNames = useMemo(() => {
    const names = new Set<string>(["id", "rec_name", "name"]);
    for (const c of columns) names.add(c.name);
    return [...names];
  }, [columns]);

  const pendingCreates = useMemo(() => {
    const out: Array<{ commandIndex: number; values: RecordValues; rowId: number }> = [];
    let n = 0;
    for (let i = 0; i < commands.length; i++) {
      const c = commands[i];
      if (c?.op !== "create") continue;
      n += 1;
      out.push({ commandIndex: i, values: c.values as RecordValues, rowId: -n });
    }
    return out;
  }, [commands]);

  const rowsQuery = useQuery({
    queryKey: ["relation-lines-rows", relation, ids, fieldNames.join(",")],
    enabled: Boolean(client && relation && ids.length),
    queryFn: async (): Promise<Array<Record<string, unknown>>> => {
      if (!client || !relation || !ids.length) return [];
      const rows = await client.searchRead(
        relation,
        [["id", "in", ids]],
        fieldNames,
        0,
        ids.length,
        null,
        sessionContext,
      );
      const byId = new Map<number, Record<string, unknown>>();
      for (const row of rows) {
        const id = Number(row.id);
        if (Number.isFinite(id)) byId.set(id, row as Record<string, unknown>);
      }
      return ids.map((id) => byId.get(id) ?? { id, rec_name: `#${id}`, name: `#${id}` });
    },
  });

  const treeRows = useMemo(() => {
    const real = rowsQuery.data ?? [];
    const queued = pendingCreates.map(({ values, rowId }) => {
      const row: Record<string, unknown> = { id: rowId };
      for (const col of columns) {
        const v = values[col.name];
        row[col.name] = v ?? (col.name === "rec_name" ? (values.name ?? "(new)") : "");
      }
      if (row.rec_name == null || row.rec_name === "") {
        row.rec_name = String(values.rec_name ?? values.name ?? "(new)");
      }
      return row;
    });
    return [...real, ...queued];
  }, [rowsQuery.data, pendingCreates, columns]);

  function addId(id: number) {
    if (!Number.isFinite(id)) return;
    updateQueue((current) =>
      current.ids.includes(id)
        ? current
        : {
            ...current,
            ids: [...current.ids, id],
            commands: [...current.commands, { op: "add", id }],
          },
    );
    setSelectedId(id);
  }

  function removeId(id: number) {
    updateQueue((current) => ({
      ...current,
      ids: current.ids.filter((x) => x !== id),
      commands: [...current.commands, { op: "remove", id }],
    }));
    if (selectedId === id) setSelectedId(null);
    if (lineForm?.kind === "edit" && lineForm.id === id) setLineForm(null);
  }

  function deleteId(id: number) {
    updateQueue((current) => ({
      ...current,
      ids: current.ids.filter((x) => x !== id),
      commands: [...current.commands, { op: "delete", id }],
    }));
    if (selectedId === id) setSelectedId(null);
    if (lineForm?.kind === "edit" && lineForm.id === id) setLineForm(null);
  }

  function discardQueued(commandIndex: number) {
    updateQueue((current) => ({
      ...current,
      commands: current.commands.filter((_, i) => i !== commandIndex),
    }));
    setSelectedId(null);
    setLineForm(null);
    setNotice("Queued create discarded");
  }

  function apply() {
    props.onCommit(relationQueueWireValue(queue));
    if (!isControlled) {
      updateQueue((current) => ({
        ...current,
        baselineIds: [...current.ids],
        commands: current.kind === "many2many" ? [] : current.commands,
      }));
    }
    setNotice(
      `${queue.kind === "many2many" ? "M2M delta" : "O2M commands"} applied — Save parent to write`,
    );
  }

  function queueLine(values: RecordValues, lineId: number | null) {
    if (lineForm?.kind === "queued") {
      const idx = lineForm.commandIndex;
      updateQueue((current) => ({
        ...current,
        commands: current.commands.map((command, index) =>
          index === idx && command.op === "create" ? { op: "create", values } : command,
        ),
      }));
      setNotice("Queued create updated — Save parent to write");
      setLineForm(null);
      return;
    }
    if (lineId != null) {
      updateQueue((current) => ({
        ...current,
        commands: [...current.commands, { op: "write", id: lineId, values }],
      }));
      setNotice(`Write #${lineId} queued — Save parent to write`);
    } else {
      updateQueue((current) => ({
        ...current,
        commands: [...current.commands, { op: "create", values }],
      }));
      setNotice("Create queued — Save parent to write");
    }
    setLineForm(null);
  }

  function selectRow(id: number) {
    setSelectedId(id);
    if (props.mode !== "write" || props.field.type !== "one2many") return;
    if (id < 0) {
      const entry = pendingCreates.find((e) => e.rowId === id);
      if (entry) setLineForm({ kind: "queued", commandIndex: entry.commandIndex });
      return;
    }
    setLineForm({ kind: "edit", id });
  }

  const selectedQueued =
    selectedId != null && selectedId < 0
      ? pendingCreates.find((e) => e.rowId === selectedId)
      : undefined;
  const hasRows = treeRows.length > 0;

  return (
    <Panel title={`${props.field.string ?? props.field.name} (${props.field.type})`}>
      <div className="epiton-relation-split">
        <div className="epiton-relation-tree">
          {hasRows ? (
            <BoardTree
              rows={treeRows}
              columns={columns}
              selectedId={selectedId}
              onSelect={(id) => selectRow(id)}
              onOpen={(id) => {
                if (id < 0) return;
                if (relation && props.onOpenLine) props.onOpenLine(relation, id);
              }}
            />
          ) : (
            <p className="epiton-board-pane-empty" role="status">
              No lines
            </p>
          )}
          {props.mode === "write" ? (
            <div className="epiton-toolbar">
              <Button onClick={() => setSearchOpen(true)}>Search add</Button>
              {props.field.type === "one2many" && relation ? (
                <Button
                  onClick={() => {
                    setLineForm({ kind: "new" });
                    setSelectedId(null);
                  }}
                >
                  New line
                </Button>
              ) : null}
              {selectedQueued ? (
                <>
                  <Button
                    onClick={() =>
                      setLineForm({ kind: "queued", commandIndex: selectedQueued.commandIndex })
                    }
                  >
                    Edit queued
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => discardQueued(selectedQueued.commandIndex)}
                  >
                    Discard
                  </Button>
                </>
              ) : null}
              {selectedId != null && selectedId > 0 ? (
                <>
                  {props.field.type === "one2many" ? (
                    <Button onClick={() => setLineForm({ kind: "edit", id: selectedId })}>
                      Edit
                    </Button>
                  ) : null}
                  <Button variant="danger" onClick={() => removeId(selectedId)}>
                    Remove
                  </Button>
                  {props.field.type === "one2many" ? (
                    <Button variant="danger" onClick={() => deleteId(selectedId)}>
                      Delete
                    </Button>
                  ) : null}
                  {relation && props.onOpenLine ? (
                    <Button onClick={() => props.onOpenLine?.(relation, selectedId)}>Open</Button>
                  ) : null}
                </>
              ) : null}
              <Button variant="primary" onClick={apply}>
                Apply relation commands
              </Button>
            </div>
          ) : selectedId != null && selectedId > 0 && relation && props.onOpenLine ? (
            <div className="epiton-toolbar">
              <Button onClick={() => props.onOpenLine?.(relation, selectedId)}>Open</Button>
            </div>
          ) : null}
        </div>
        {lineForm != null && relation ? (
          <div className="epiton-relation-form">
            <RelationLineForm
              model={relation}
              lineId={lineForm.kind === "edit" ? lineForm.id : null}
              initialValues={
                lineForm.kind === "queued"
                  ? (commands[lineForm.commandIndex] as Extract<O2MCommand, { op: "create" }>)
                      ?.values
                  : undefined
              }
              onCancel={() => setLineForm(null)}
              onSave={queueLine}
              onOpenRelated={props.onOpenLine}
            />
          </div>
        ) : null}
      </div>
      {searchOpen && relation ? (
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
        Relation: {relation ?? "—"} · lines: {ids.length} · queued creates: {pendingCreates.length}{" "}
        · pending ops: {commands.length}
      </p>
    </Panel>
  );
}
