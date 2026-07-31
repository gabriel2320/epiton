import type { JsonObject, ResolvedAction } from "@epiton/protocol";
import { resolveBoardAction } from "@epiton/protocol";
import { Badge, Button, Panel, StateBlock } from "@epiton/ui";
import {
  aggregateGraphData,
  evalContext,
  evalDomain,
  inferGraphFields,
  parseFieldsViewGet,
  parseGraphArch,
  summarizeSeries,
  treeColumns,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../lib/store";
import { GraphView } from "./GraphView";

const PREVIEW_LIMIT = 80;

/** Embedded interactive pane for one board action (Tryton-backed). */
export function BoardPane(props: {
  actionName: string;
  title?: string;
  onOpen: (ref: string) => void;
  dragging?: boolean;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);

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

  const domain = (() => {
    if (resolved?.kind !== "model") return [] as unknown[];
    const overlay = evalContext(resolved.context ?? {}, sessionContext);
    return evalDomain(resolved.domain ?? [], { ...sessionContext, ...overlay });
  })();

  const rpcContext: JsonObject = (() => {
    if (resolved?.kind !== "model") return sessionContext as JsonObject;
    const overlay = evalContext(resolved.context ?? {}, sessionContext);
    return { ...sessionContext, ...overlay } as JsonObject;
  })();

  const analyticsQuery = useQuery({
    queryKey: ["board-pane", "analytics", model, JSON.stringify(domain)],
    enabled: Boolean(client && model),
    staleTime: 30_000,
    queryFn: async () => {
      if (!client || !model) return null;
      let count: number | null = null;
      try {
        const c = await client.model(model, "search_count", [domain as never[]], rpcContext);
        count = typeof c === "number" ? c : null;
      } catch {
        count = null;
      }

      let chartType: "vbar" | "hbar" | "line" | "pie" = "vbar";
      let xField = "rec_name";
      let yField = "id";
      let fields = ["id", "rec_name", "name", "code", "active"];

      try {
        const graphFv = parseFieldsViewGet(
          await client.fieldsViewGet(model, null, "graph", rpcContext),
        );
        const spec = parseGraphArch(graphFv.arch);
        if (spec) {
          chartType = spec.type;
          xField = spec.xFields[0] ?? xField;
          yField = spec.yFields[0] ?? yField;
          fields = [...new Set([xField, yField, "id", "rec_name"])];
        }
      } catch {
        try {
          const treeFv = parseFieldsViewGet(
            await client.fieldsViewGet(model, null, "tree", rpcContext),
          );
          const cols = treeColumns(treeFv).map((c) => c.name);
          const inferred = inferGraphFields(cols.length ? cols : fields);
          xField = inferred.xField;
          yField = inferred.yField;
          fields = [...new Set([xField, yField, "id", "rec_name", ...cols.slice(0, 6)])];
        } catch {
          /* keep defaults */
        }
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
        chartType,
        xField,
        yField,
        data,
        insight: summarizeSeries(data),
        title: resolved?.kind === "model" ? resolved.name : undefined,
      };
    },
  });

  const title =
    props.title ||
    analyticsQuery.data?.title ||
    (resolved?.kind === "model" ? resolved.model : props.actionName);

  const state = resolvedQuery.isLoading ? "loading" : resolvedQuery.isError ? "error" : "data";

  function openResolved() {
    const r = resolved;
    if (!r) {
      props.onOpen(props.actionName);
      return;
    }
    if (r.kind === "model")
      props.onOpen(r.actionId ? `ir.action.act_window,${r.actionId}` : r.model);
    else if (r.kind === "wizard") props.onOpen(r.wizard);
    else if (r.kind === "report") props.onOpen(r.report);
    else if (r.kind === "url") props.onOpen(props.actionName);
    else props.onOpen(props.actionName);
  }

  return (
    <Panel title={title} className={props.dragging ? "epiton-board-pane-dragging" : undefined}>
      <StateBlock
        state={state}
        message={resolvedQuery.error instanceof Error ? resolvedQuery.error.message : "Resolving…"}
      >
        <div className="epiton-board-pane-head">
          {analyticsQuery.data?.count != null ? (
            <Badge tone="accent">{analyticsQuery.data.count} records</Badge>
          ) : (
            <Badge tone="muted">{resolved?.kind ?? "…"}</Badge>
          )}
          <Button variant="primary" onClick={openResolved}>
            Open
          </Button>
        </div>
        {model && analyticsQuery.data?.data.length ? (
          <GraphView
            data={analyticsQuery.data.data}
            chartType={analyticsQuery.data.chartType}
            yLabel={analyticsQuery.data.yField}
            height={220}
            insight={analyticsQuery.data.insight}
          />
        ) : model ? (
          <p className="epiton-board-pane-empty" role="status">
            {analyticsQuery.isLoading ? "Loading analytics…" : "No preview rows for this domain"}
          </p>
        ) : resolved?.kind === "report" || resolved?.kind === "wizard" ? (
          <p className="epiton-board-pane-empty" role="status">
            {resolved.kind} action — open to run on Tryton
          </p>
        ) : null}
      </StateBlock>
    </Panel>
  );
}
