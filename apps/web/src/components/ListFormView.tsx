import { Panel } from "@epiton/ui";

/** Compact list-form host: one card per row with labeled fields. */
export function ListFormView(props: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ name: string; string: string }>;
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
              {props.columns.map((col) => (
                <div key={col.name} className="epiton-list-form-field">
                  <span className="epiton-field-label">{col.string}</span>
                  <span>{formatCell(row[col.name])}</span>
                </div>
              ))}
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
  if (Array.isArray(value)) return value.map((v) => String(v)).join(" · ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
