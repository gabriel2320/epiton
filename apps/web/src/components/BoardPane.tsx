import type { JsonObject, ResolvedAction } from "@epiton/protocol";
import { resolveBoardAction } from "@epiton/protocol";
import { Badge, Button, Panel, StateBlock, Tab, Tabs } from "@epiton/ui";
import {
  aggregateGraphData,
  evalContext,
  evalDomain,
  inferGraphFields,
  mergeDomains,
  parseFieldsViewGet,
  parseGraphArch,
  summarizeSeries,
  treeColumns,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import { BoardTree } from "./BoardTree";
import { GraphView } from "./GraphView";
import { RecordFormPane } from "./RecordFormPane";

const PREVIEW_LIMIT = 60;

export type BoardSelection = {
  paneId: string;
  model: string;
  id: number;
  label: string;
};

/** Embedded interactive pane for one board action (Tryton-backed). */
export function BoardPane(props: {
  paneId: string;
  actionName: string;
  title?: string;
  onOpen: (ref: string) => void;
  onOpenRecord?: (model: string, id: number) => void;
  dragging?: boolean;
  /** Sao-like active record from another pane (`active_id` / cross-filter). */
  activeSelection?: BoardSelection | null;
  onSelectRecord?: (selection: BoardSelection | null) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [mode, setMode] = useState<"tree" | "graph" | "form">("tree");
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(null);

  const resolvedQuery = useQuery({
    queryKey: ["board-pane", "resolve", props.actionName],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ResolvedAction> => {
      if (!client) return { kind: "unsupported", ref: props.actionName, reason: "no client" };
      return resolveBoardAction(client, props.actionName);
    },
  });

  const resolved = resolvedQuery.data;
  const model = resolved?.kind === "model" ? resolved.model : null;

  const foreignActive =
    props.activeSelection && props.activeSelection.paneId !== props.paneId
      ? props.activeSelection
      : null;

  const evalBag = useMemo(() => {
    const base = { ...sessionContext } as Record<string, unknown>;
    if (resolved?.kind === "model") {
      Object.assign(base, evalContext(resolved.context ?? {}, sessionContext));
    }
    if (foreignActive) {
      base.active_id = foreignActive.id;
      base.active_ids = [foreignActive.id];
      base.active_model = foreignActive.model;
    } else {
      base.active_id = null;
      base.active_ids = [];
      base.active_model = null;
    }
    return base;
  }, [sessionContext, resolved, foreignActive]);

  const domain = useMemo(() => {
    if (resolved?.kind !== "model") return [] as unknown[];
    const actionDomain = evalDomain(resolved.domain ?? [], evalBag);
    if (!foreignActive) return actionDomain;
    if (foreignActive.model === model) {
      return mergeDomains(actionDomain, [["id", "=", foreignActive.id]]);
    }
    const hint = foreignActive.model.split(".").pop();
    if (!hint) return actionDomain;
    const cross: unknown[] = [
      "OR",
      [hint, "=", foreignActive.id],
      [hint.replace(/s$/, ""), "=", foreignActive.id],
    ];
    return mergeDomains(actionDomain, [cross]);
  }, [resolved, evalBag, foreignActive, model]);

  const rpcContext = useMemo(() => ({ ...evalBag }) as JsonObject, [evalBag]);

  const screenQuery = useQuery({
    queryKey: [
      "board-pane",
      "screen",
      model,
      JSON.stringify(domain),
      foreignActive?.id ?? null,
      foreignActive?.model ?? null,
    ],
    enabled: Boolean(client && model),
    staleTime: 20_000,
    queryFn: async () => {
      if (!client || !model) return null;

      let count: number | null = null;
      try {
        const c = await client.model(model, "search_count", [domain as never[]], rpcContext);
        count = typeof c === "number" ? c : null;
      } catch {
        count = null;
      }

      let columns = [
        { name: "id", string: "ID" },
        { name: "rec_name", string: "Name" },
      ];
      let chartType: "vbar" | "hbar" | "line" | "pie" = "vbar";
      let xField = "rec_name";
      let yField = "id";
      let yFields = ["id"];
      let fields = ["id", "rec_name", "name", "code", "active"];

      try {
        const treeFv = parseFieldsViewGet(
          await client.fieldsViewGet(model, null, "tree", rpcContext),
        );
        columns = treeColumns(treeFv).slice(0, 6);
        const names = columns.map((c) => c.name);
        fields = [...new Set(["id", "rec_name", ...names])];
        const inferred = inferGraphFields(names.length ? names : fields);
        xField = inferred.xField;
        yField = inferred.yField;
        yFields = [inferred.yField];
      } catch {
        /* defaults */
      }

      try {
        const graphFv = parseFieldsViewGet(
          await client.fieldsViewGet(model, null, "graph", rpcContext),
        );
        const spec = parseGraphArch(graphFv.arch);
        if (spec) {
          chartType = spec.type;
          xField = spec.xFields[0] ?? xField;
          yFields = spec.yFields.length ? spec.yFields : [yField];
          yField = yFields[0] ?? yField;
          fields = [...new Set([...fields, xField, ...yFields])];
        }
      } catch {
        /* optional */
      }

      let rows: Array<Record<string, unknown>> = [];
      try {
        rows = (await client.searchRead(
          model,
          domain as never[],
          fields,
          0,
          PREVIEW_LIMIT,
          null,
          rpcContext,
        )) as Array<Record<string, unknown>>;
      } catch {
        rows = [];
      }

      const data = aggregateGraphData(rows, xField, yField);
      return {
        count,
        columns,
        rows,
        chartType,
        xField,
        yField,
        yFields,
        data,
        insight: summarizeSeries(data),
        title: resolved?.kind === "model" ? resolved.name : undefined,
      };
    },
  });

  const title =
    props.title ||
    screenQuery.data?.title ||
    (resolved?.kind === "model" ? resolved.model : props.actionName);

  const state = resolvedQuery.isLoading ? "loading" : resolvedQuery.isError ? "error" : "data";
  const selectedId =
    props.activeSelection?.paneId === props.paneId ? props.activeSelection.id : localSelectedId;

  function openAction() {
    const r = resolved;
    if (!r) {
      props.onOpen(props.actionName);
      return;
    }
    if (r.kind === "model") {
      props.onOpen(r.actionId ? `ir.action.act_window,${r.actionId}` : r.model);
    } else if (r.kind === "wizard") props.onOpen(r.wizard);
    else if (r.kind === "report") props.onOpen(r.report);
    else props.onOpen(props.actionName);
  }

  function openRecord(id: number) {
    if (model && props.onOpenRecord) {
      props.onOpenRecord(model, id);
      return;
    }
    openAction();
  }

  function selectRow(id: number, row: Record<string, unknown>) {
    if (!model) return;
    setLocalSelectedId(id);
    const label = String(row.rec_name ?? row.name ?? id);
    props.onSelectRecord?.({ paneId: props.paneId, model, id, label });
  }

  return (
    <Panel title={title} className={props.dragging ? "epiton-board-pane-dragging" : undefined}>
      <StateBlock
        state={state}
        message={resolvedQuery.error instanceof Error ? resolvedQuery.error.message : "Resolving…"}
      >
        <div className="epiton-board-pane-head">
          {screenQuery.data?.count != null ? (
            <Badge tone="accent">{screenQuery.data.count} records</Badge>
          ) : (
            <Badge tone="muted">{resolved?.kind ?? "…"}</Badge>
          )}
          {foreignActive ? (
            <Badge tone="muted">
              filtered · {foreignActive.model}#{foreignActive.id}
            </Badge>
          ) : null}
          <Button
            variant="primary"
            onClick={() => (selectedId != null ? openRecord(selectedId) : openAction())}
          >
            Open
          </Button>
          {props.activeSelection?.paneId === props.paneId ? (
            <Button
              variant="ghost"
              onClick={() => {
                setLocalSelectedId(null);
                props.onSelectRecord?.(null);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {model ? (
          <>
            <Tabs aria-label="Pane mode" className="epiton-board-pane-modes">
              <Tab active={mode === "tree"} onClick={() => setMode("tree")}>
                Tree
              </Tab>
              <Tab active={mode === "graph"} onClick={() => setMode("graph")}>
                Graph
              </Tab>
              <Tab
                active={mode === "form"}
                onClick={() => {
                  if (selectedId != null) setMode("form");
                }}
              >
                Form
              </Tab>
            </Tabs>
            {screenQuery.isLoading ? (
              <p className="epiton-board-pane-empty" role="status">
                Loading screen…
              </p>
            ) : mode === "form" && selectedId != null && model ? (
              <RecordFormPane
                model={model}
                recordId={selectedId}
                rpcContext={rpcContext}
                onSaved={() => void screenQuery.refetch()}
              />
            ) : mode === "tree" ? (
              <BoardTree
                rows={screenQuery.data?.rows ?? []}
                columns={screenQuery.data?.columns ?? []}
                selectedId={selectedId}
                onSelect={selectRow}
                onOpen={openRecord}
              />
            ) : screenQuery.data?.data.length ? (
              <GraphView
                data={screenQuery.data.data}
                chartType={screenQuery.data.chartType}
                yLabel={screenQuery.data.yField}
                yKeys={screenQuery.data.yFields.length > 1 ? screenQuery.data.yFields : undefined}
                height={200}
                insight={screenQuery.data.insight}
              />
            ) : (
              <p className="epiton-board-pane-empty" role="status">
                No graph data
              </p>
            )}
          </>
        ) : resolved?.kind === "report" || resolved?.kind === "wizard" ? (
          <p className="epiton-board-pane-empty" role="status">
            {resolved.kind} action — open to run on Tryton
          </p>
        ) : null}
      </StateBlock>
    </Panel>
  );
}
