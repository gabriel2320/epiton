/** Compact embedded tree for board panes (Sao-style in-pane list). */

function cellText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  return String(value);
}

export function BoardTree(props: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ name: string; string: string }>;
  selectedId: number | null;
  onSelect: (id: number, row: Record<string, unknown>) => void;
  onOpen?: (id: number) => void;
}) {
  const cols = props.columns.slice(0, 5);
  if (!props.rows.length) {
    return (
      <p className="epiton-board-pane-empty" role="status">
        No rows
      </p>
    );
  }
  return (
    <div className="epiton-board-tree" role="region" aria-label="Board tree">
      <div className="epiton-board-tree-head">
        {cols.map((c) => (
          <span key={c.name}>{c.string}</span>
        ))}
      </div>
      <ul className="epiton-board-tree-body">
        {props.rows.map((row) => {
          const id = Number(row.id);
          if (!Number.isFinite(id)) return null;
          const selected = props.selectedId === id;
          return (
            <li key={id}>
              <button
                type="button"
                className="epiton-board-tree-row"
                data-selected={selected}
                aria-pressed={selected}
                onClick={() => props.onSelect(id, row)}
                onDoubleClick={() => props.onOpen?.(id)}
              >
                {cols.map((c) => (
                  <span key={c.name}>{cellText(row[c.name])}</span>
                ))}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
