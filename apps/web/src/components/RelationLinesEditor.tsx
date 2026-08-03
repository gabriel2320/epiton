import type { JsonObject } from "@epiton/protocol";
import { Button, Panel } from "@epiton/ui";
import {
  type ChildScreenExitDecision,
  type ChildScreenTarget,
  childScreenTargetKey,
  createRelationQueue,
  type ParsedView,
  parseFieldsViewGet,
  type RecordValues,
  type RelationCommandQueue,
  relationQueueWireValue,
  relationQueueWithTrytonTimestamps,
  removeChildScreen,
  treeColumns,
  trytonTimestampsForRecords,
  type ViewField,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { backendRpcContextKey } from "../lib/backendTruth";
import { useAppStore } from "../lib/store";
import { BoardTree } from "./BoardTree";
import { RelationLineForm } from "./RelationLineForm";
import { RelationSearch } from "./RelationSearch";

/** Inline editor for One2Many / Many2Many line commands (Sao-style tree + form). */
export function RelationLinesEditor(props: {
  field: ViewField;
  value: unknown;
  mode: "read" | "write";
  recordValues?: Record<string, unknown>;
  domain?: unknown[];
  context?: JsonObject;
  /** Parent-owned queue when the editor participates in a Screen lifecycle. */
  queue?: RelationCommandQueue;
  onQueueChange?: (update: (current: RelationCommandQueue) => RelationCommandQueue) => void;
  /** Serialized Tryton tuples for legacy/uncontrolled hosts and explicit apply. */
  onCommit: (next: unknown) => void;
  /** Open nested related record (O2M/M2M line). */
  onOpenLine?: (model: string, id: number) => void;
  /** Bubble an uncommitted child draft to the owning Screen. */
  onExitDecisionChange?: (decision: ChildScreenExitDecision) => void;
}) {
  const { t } = useTranslation();
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const rpcContext = useMemo(
    () => ({ ...sessionContext, ...(props.context ?? {}) }),
    [sessionContext, props.context],
  );
  const rpcScope = backendRpcContextKey(rpcContext);
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
  const [lineForm, setLineForm] = useState<ChildScreenTarget | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lineExitDecision, setLineExitDecision] = useState<ChildScreenExitDecision>({
    kind: "allow",
  });

  const publishLineExitDecision = useCallback(
    (decision: ChildScreenExitDecision) => {
      setLineExitDecision((current) => (current.kind === decision.kind ? current : decision));
      props.onExitDecisionChange?.(decision);
    },
    [props.onExitDecisionChange],
  );

  useEffect(
    () => () => props.onExitDecisionChange?.({ kind: "allow" }),
    [props.onExitDecisionChange],
  );

  useEffect(() => {
    if (isControlled) return;
    setLocalQueue(initialQueue);
    setSelectedId(null);
    setLineForm(null);
    publishLineExitDecision({ kind: "allow" });
  }, [initialQueue, isControlled, publishLineExitDecision]);

  function replaceLineForm(next: ChildScreenTarget | null): boolean {
    const sameTarget =
      lineForm != null &&
      next != null &&
      childScreenTargetKey(lineForm) === childScreenTargetKey(next);
    if (sameTarget) return true;
    if (
      lineExitDecision.kind === "confirm-discard" &&
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(t("relationLine.discardConfirm"))
    ) {
      return false;
    }
    publishLineExitDecision({ kind: "allow" });
    setLineForm(next);
    return true;
  }

  function finishLineForm() {
    publishLineExitDecision({ kind: "allow" });
    setLineForm(null);
  }

  const treeViewQuery = useQuery({
    queryKey: ["relation-lines-tree", relation, rpcScope],
    enabled: Boolean(client && relation),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParsedView | null> => {
      if (!client || !relation) return null;
      try {
        return parseFieldsViewGet(await client.fieldsViewGet(relation, null, "tree", rpcContext));
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
      { name: "rec_name", string: t("relationLines.name") },
      { name: "id", string: t("relationLines.id") },
    ];
  }, [treeViewQuery.data, t]);

  const fieldNames = useMemo(() => {
    const names = new Set<string>(["id", "rec_name", "name", "_timestamp"]);
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
    queryKey: ["relation-lines-rows", relation, ids, fieldNames.join(","), rpcScope],
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
        rpcContext,
      );
      const byId = new Map<number, Record<string, unknown>>();
      for (const row of rows) {
        const id = Number(row.id);
        if (Number.isFinite(id)) byId.set(id, row as Record<string, unknown>);
      }
      return ids.map((id) => byId.get(id) ?? { id, rec_name: `#${id}`, name: `#${id}` });
    },
  });

  function updateQueue(update: (current: RelationCommandQueue) => RelationCommandQueue) {
    const visibleTimestamps = relation
      ? trytonTimestampsForRecords(relation, rowsQuery.data ?? [])
      : {};
    const guardedUpdate = (current: RelationCommandQueue) => {
      const guarded = relationQueueWithTrytonTimestamps(current, visibleTimestamps);
      const next = update(guarded);
      return relationQueueWithTrytonTimestamps(next, guarded.timestamps);
    };
    if (isControlled) {
      props.onQueueChange?.(guardedUpdate);
      return;
    }
    setLocalQueue(guardedUpdate);
  }

  const treeRows = useMemo(() => {
    const real = rowsQuery.data ?? [];
    const queued = pendingCreates.map(({ values, rowId }) => {
      const row: Record<string, unknown> = { id: rowId };
      for (const col of columns) {
        const v = values[col.name];
        row[col.name] =
          v ?? (col.name === "rec_name" ? (values.name ?? t("relationLines.newRecord")) : "");
      }
      if (row.rec_name == null || row.rec_name === "") {
        row.rec_name = String(values.rec_name ?? values.name ?? t("relationLines.newRecord"));
      }
      return row;
    });
    return [...real, ...queued];
  }, [rowsQuery.data, pendingCreates, columns, t]);

  function addId(id: number): boolean {
    if (!Number.isFinite(id) || !replaceLineForm(null)) return false;
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
    return true;
  }

  function removeId(id: number) {
    if (!replaceLineForm(null)) return;
    updateQueue((current) => {
      const result = removeChildScreen(current, { kind: "record", id }, "remove");
      return result.ok ? result.queue : current;
    });
    if (selectedId === id) setSelectedId(null);
  }

  function deleteId(id: number) {
    if (!replaceLineForm(null)) return;
    updateQueue((current) => {
      const result = removeChildScreen(current, { kind: "record", id }, "delete");
      return result.ok ? result.queue : current;
    });
    if (selectedId === id) setSelectedId(null);
  }

  function discardQueued(commandIndex: number) {
    if (!replaceLineForm(null)) return;
    updateQueue((current) => {
      const result = removeChildScreen(current, { kind: "queued-create", commandIndex });
      return result.ok ? result.queue : current;
    });
    setSelectedId(null);
    setNotice(t("relationLines.discarded"));
  }

  function apply() {
    if (!replaceLineForm(null)) return;
    props.onCommit(relationQueueWireValue(queue));
    if (!isControlled) {
      updateQueue((current) => ({
        ...current,
        baselineIds: [...current.ids],
        commands: current.kind === "many2many" ? [] : current.commands,
      }));
    }
    setNotice(
      t("relationLines.applied", {
        kind:
          queue.kind === "many2many" ? t("relationLines.m2mDelta") : t("relationLines.o2mCommands"),
      }),
    );
  }

  function queueLine(next: RelationCommandQueue) {
    const target = lineForm;
    updateQueue(() => next);
    setNotice(
      target?.kind === "record"
        ? t("relationLines.writeQueued", { id: target.id })
        : target?.kind === "queued-create"
          ? t("relationLines.createUpdated")
          : t("relationLines.createQueued"),
    );
    finishLineForm();
  }

  function selectRow(id: number) {
    let next: ChildScreenTarget | null = null;
    if (props.mode === "write" && props.field.type === "one2many" && id < 0) {
      const entry = pendingCreates.find((e) => e.rowId === id);
      if (entry) next = { kind: "queued-create", commandIndex: entry.commandIndex };
    } else if (props.mode === "write" && props.field.type === "one2many") {
      next = { kind: "record", id };
    }
    if (!replaceLineForm(next)) return;
    setSelectedId(id);
  }

  function openLine(id: number) {
    if (!relation || !props.onOpenLine || !replaceLineForm(null)) return;
    props.onOpenLine(relation, id);
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
                openLine(id);
              }}
            />
          ) : (
            <p className="epiton-board-pane-empty" role="status">
              {t("relationLines.noLines")}
            </p>
          )}
          {props.mode === "write" ? (
            <div className="epiton-toolbar">
              <Button
                onClick={() => {
                  if (replaceLineForm(null)) setSearchOpen(true);
                }}
              >
                {t("relationLines.searchAdd")}
              </Button>
              {props.field.type === "one2many" && relation && props.field.create !== false ? (
                <Button
                  onClick={() => {
                    if (replaceLineForm({ kind: "new" })) setSelectedId(null);
                  }}
                >
                  {t("relationLines.newLine")}
                </Button>
              ) : null}
              {selectedQueued ? (
                <>
                  <Button
                    onClick={() => {
                      replaceLineForm({
                        kind: "queued-create",
                        commandIndex: selectedQueued.commandIndex,
                      });
                    }}
                  >
                    {t("relationLines.editQueued")}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => discardQueued(selectedQueued.commandIndex)}
                  >
                    {t("relationLines.discard")}
                  </Button>
                </>
              ) : null}
              {selectedId != null && selectedId > 0 ? (
                <>
                  {props.field.type === "one2many" ? (
                    <Button onClick={() => replaceLineForm({ kind: "record", id: selectedId })}>
                      {t("relationLines.edit")}
                    </Button>
                  ) : null}
                  <Button variant="danger" onClick={() => removeId(selectedId)}>
                    {t("relationLines.remove")}
                  </Button>
                  {props.field.type === "one2many" && props.field.delete !== false ? (
                    <Button variant="danger" onClick={() => deleteId(selectedId)}>
                      {t("relationLines.delete")}
                    </Button>
                  ) : null}
                  {relation && props.onOpenLine ? (
                    <Button onClick={() => openLine(selectedId)}>{t("relationLines.open")}</Button>
                  ) : null}
                </>
              ) : null}
              <Button variant="primary" onClick={apply}>
                {t("relationLines.apply")}
              </Button>
            </div>
          ) : selectedId != null && selectedId > 0 && relation && props.onOpenLine ? (
            <div className="epiton-toolbar">
              <Button onClick={() => openLine(selectedId)}>{t("relationLines.open")}</Button>
            </div>
          ) : null}
        </div>
        {lineForm != null && relation ? (
          <div className="epiton-relation-form">
            <RelationLineForm
              key={childScreenTargetKey(lineForm)}
              model={relation}
              target={lineForm}
              parentQueue={queue}
              context={props.context}
              preValidate={props.field.pre_validate}
              onCancel={finishLineForm}
              onCommit={queueLine}
              onOpenRelated={props.onOpenLine}
              onExitDecisionChange={publishLineExitDecision}
            />
          </div>
        ) : null}
      </div>
      {searchOpen && relation ? (
        <RelationSearch
          field={props.field}
          recordValues={props.recordValues ?? {}}
          domain={props.domain}
          context={rpcContext}
          mode={props.mode}
          onCancel={() => setSearchOpen(false)}
          onPick={(id) => {
            if (addId(id)) setSearchOpen(false);
          }}
        />
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <p className="text-sm text-[var(--epiton-muted)]">
        {t("relationLines.summary", {
          relation: relation ?? "—",
          lines: ids.length,
          creates: pendingCreates.length,
          operations: commands.length,
        })}
      </p>
    </Panel>
  );
}
