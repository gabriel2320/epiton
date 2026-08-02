import { Panel } from "@epiton/ui";
import { type ParsedView, type RecordValues, renderView } from "@epiton/view-engine";

/** Compact list-form host: one card per row rendered from list-form arch. */
export function ListFormView(props: {
  rows: Array<Record<string, unknown>>;
  /** When present, render Sao list-form widgets per card. */
  view?: ParsedView | null;
  columns: Array<{ name: string; string: string }>;
  density?: "compact" | "comfortable";
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="epiton-list-form" aria-label="List form">
      {props.rows.map((row) => {
        const id = Number(row.id);
        return (
          <li key={Number.isFinite(id) ? id : JSON.stringify(row)}>
            <button
              type="button"
              className="epiton-list-form-card"
              data-selected={props.selectedId === id}
              onClick={() => Number.isFinite(id) && props.onSelect(id)}
            >
              <strong>#{Number.isFinite(id) ? id : "—"}</strong>
              {props.view ? (
                <div
                  className="epiton-list-form-view"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {renderView(props.view, {
                    values: row as RecordValues,
                    mode: "read",
                    density: props.density ?? "compact",
                  })}
                </div>
              ) : (
                props.columns.map((col) => (
                  <div key={col.name} className="epiton-list-form-field">
                    <span className="epiton-field-label">{col.string}</span>
                    <span>{formatCell(row[col.name])}</span>
                  </div>
                ))
              )}
            </button>
          </li>
        );
      })}
      {!props.rows.length ? (
        <li>
          <Panel title="Empty">No records</Panel>
        </li>
      ) : null}
    </ul>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "—");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
