import type { GraphChartType, SeriesInsight } from "@epiton/view-engine";
import { GRAPH_ROW_LIMIT } from "@epiton/view-engine";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#3dd6c6", "#f0a05a", "#7aa2ff", "#c084fc", "#f472b6", "#94a3b8"];

export function GraphView(props: {
  data: Array<{ x: string; y: number }>;
  /** Multi-series rows ({ x, [yField]: number }). Overrides `data` when set. */
  multi?: Array<Record<string, string | number>>;
  yKeys?: string[];
  chartType?: GraphChartType;
  yLabel?: string;
  title?: string;
  height?: number;
  insight?: SeriesInsight | null;
  /** Sao board: click a category to cross-filter. */
  onSelectPoint?: (label: string) => void;
}) {
  const chartType = props.chartType ?? "vbar";
  const series = props.multi?.length ? props.multi : props.data.map((d) => ({ x: d.x, y: d.y }));
  const yKeys = props.yKeys?.length ? props.yKeys : ["y"];
  const truncated = series.length >= GRAPH_ROW_LIMIT;
  const height = props.height ?? 320;

  function pickLabel(payload: unknown): void {
    if (!props.onSelectPoint) return;
    const row = payload as { x?: string; name?: string; payload?: { x?: string } };
    const label = String(row.payload?.x ?? row.x ?? row.name ?? "");
    if (label) props.onSelectPoint(label);
  }

  return (
    <div className="epiton-graph" role="img" aria-label={props.title ?? "Graph view"}>
      {props.title ? <h3 className="epiton-graph-title">{props.title}</h3> : null}
      {props.insight && props.insight.count > 0 ? (
        <dl className="epiton-analytics-strip" aria-label="Series insights">
          <div>
            <dt>Points</dt>
            <dd>{props.insight.count}</dd>
          </div>
          <div>
            <dt>Sum</dt>
            <dd>{formatNum(props.insight.sum)}</dd>
          </div>
          <div>
            <dt>Avg</dt>
            <dd>{formatNum(props.insight.avg)}</dd>
          </div>
          <div>
            <dt>Max</dt>
            <dd>{formatNum(props.insight.max)}</dd>
          </div>
        </dl>
      ) : null}
      {series.length === 0 ? (
        <p role="status">No graph data</p>
      ) : chartType === "pie" ? (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={series as Array<{ x: string; y: number }>}
              dataKey={yKeys[0] ?? "y"}
              nameKey="x"
              cx="50%"
              cy="50%"
              outerRadius={Math.min(110, height / 2 - 20)}
              label
              onClick={(_, index) => {
                const row = series[index] as { x?: string } | undefined;
                if (row?.x) props.onSelectPoint?.(String(row.x));
              }}
            >
              {series.map((row, i) => (
                <Cell key={`cell-${String(row.x)}-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : chartType === "line" ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={PIE_COLORS[i % PIE_COLORS.length]}
                name={key === "y" ? (props.yLabel ?? "value") : key}
                dot={false}
                activeDot={{
                  onClick: (_: unknown, payload: unknown) => pickLabel(payload),
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={series} layout={chartType === "hbar" ? "vertical" : "horizontal"}>
            <CartesianGrid strokeDasharray="3 3" />
            {chartType === "hbar" ? (
              <>
                <XAxis type="number" />
                <YAxis type="category" dataKey="x" width={90} />
              </>
            ) : (
              <>
                <XAxis dataKey="x" />
                <YAxis />
              </>
            )}
            <Tooltip />
            <Legend />
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
                name={key === "y" ? (props.yLabel ?? "value") : key}
                onClick={(data) => pickLabel(data)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      {truncated ? (
        <p className="epiton-graph-limit" role="status">
          Showing first {GRAPH_ROW_LIMIT} rows (client-side limit)
        </p>
      ) : null}
    </div>
  );
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
