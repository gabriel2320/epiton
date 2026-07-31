import { GRAPH_ROW_LIMIT } from "@epiton/view-engine";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function GraphView(props: {
  data: Array<{ x: string; y: number }>;
  yLabel?: string;
  height?: number;
}) {
  const truncated = props.data.length >= GRAPH_ROW_LIMIT;
  return (
    <div className="epiton-graph" role="img" aria-label="Graph view">
      {props.data.length === 0 ? (
        <p role="status">No graph data</p>
      ) : (
        <ResponsiveContainer width="100%" height={props.height ?? 320}>
          <BarChart data={props.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="y" fill="var(--epiton-accent, #2dd4bf)" name={props.yLabel ?? "value"} />
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
