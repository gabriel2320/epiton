import type { ColumnDef, SortingState, Updater } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";

type TreeCol = {
  name: string;
  string: string;
  type?: string;
  readonly?: boolean;
};

function cellDisplay(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  return String(value);
}

function EditableCell(props: {
  id: number;
  field: TreeCol;
  value: unknown;
  onCommit: (id: number, field: string, value: unknown) => void;
}) {
  const readonly = props.field.readonly || props.field.name === "id";
  const type = props.field.type ?? "char";

  if (readonly || type === "many2one" || type === "one2many" || type === "many2many") {
    return <span>{cellDisplay(props.value)}</span>;
  }

  if (type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(props.value)}
        aria-label={props.field.string}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => props.onCommit(props.id, props.field.name, e.target.checked)}
      />
    );
  }

  const inputType =
    type === "integer" || type === "float" || type === "numeric" ? "number" : "text";
  return (
    <input
      className="epiton-tree-edit"
      type={inputType}
      defaultValue={cellDisplay(props.value)}
      aria-label={props.field.string}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const raw = e.target.value;
        let next: unknown = raw;
        if (inputType === "number") {
          const n = Number(raw);
          next = Number.isFinite(n) ? n : raw;
        }
        if (String(props.value ?? "") === String(next ?? "")) return;
        props.onCommit(props.id, props.field.name, next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function VirtualPartyTable(props: {
  rows: Array<Record<string, unknown>>;
  columns: TreeCol[];
  selectedId: number | null;
  selectedIds?: number[];
  editable?: boolean;
  /** When set, sorting is server-driven (no client re-sort). */
  onSortChange?: (sorts: Array<{ id: string; desc: boolean }>) => void;
  onSelect: (id: number) => void;
  onToggleSelect?: (id: number) => void;
  onCellCommit?: (id: number, field: string, value: unknown) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const serverSort = Boolean(props.onSortChange);

  function handleSortingChange(updater: Updater<SortingState>) {
    setSorting((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      props.onSortChange?.(next.map((s) => ({ id: s.id, desc: Boolean(s.desc) })));
      return next;
    });
  }

  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = [];
    if (props.onToggleSelect) {
      cols.push({
        id: "_select",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const id = Number(row.original.id);
          const checked = (props.selectedIds ?? []).includes(id);
          return (
            <input
              type="checkbox"
              checked={checked}
              aria-label={`Select ${id}`}
              onClick={(e) => e.stopPropagation()}
              onChange={() => props.onToggleSelect?.(id)}
            />
          );
        },
      });
    }
    for (const c of props.columns) {
      cols.push({
        accessorKey: c.name,
        header: c.string,
        cell: (info) => {
          const id = Number(info.row.original.id);
          if (props.editable && props.onCellCommit && Number.isFinite(id)) {
            return (
              <EditableCell
                id={id}
                field={c}
                value={info.getValue()}
                onCommit={props.onCellCommit}
              />
            );
          }
          return cellDisplay(info.getValue());
        },
      });
    }
    return cols;
  }, [props.columns, props.onToggleSelect, props.selectedIds, props.editable, props.onCellCommit]);

  const table = useReactTable({
    data: props.rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: serverSort ? undefined : getSortedRowModel(),
    manualSorting: serverSort,
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[480px] overflow-auto rounded-xl border border-[var(--epiton-border)]"
    >
      {props.editable ? (
        <p className="epiton-tree-editable-hint" role="note">
          Editable tree — change a cell and blur/Enter to write on trytond
        </p>
      ) : null}
      <table className="epiton-table w-full">
        <thead className="sticky top-0 bg-[var(--epiton-bg-elevated)] z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="cursor-pointer select-none">
                  {h.column.getCanSort() ? (
                    <button
                      type="button"
                      className="bg-transparent border-0 p-0 font-inherit text-inherit cursor-pointer"
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? null}
                    </button>
                  ) : (
                    flexRender(h.column.columnDef.header, h.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const id = Number(row.original.id);
            return (
              <tr
                key={row.id}
                className={cn(
                  id === props.selectedId
                    ? "bg-[color-mix(in_oklab,var(--epiton-accent)_16%,transparent)]"
                    : "",
                )}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: "100%",
                  display: "table",
                  tableLayout: "fixed",
                }}
                onClick={() => props.onSelect(id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
