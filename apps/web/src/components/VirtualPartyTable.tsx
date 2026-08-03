import {
  decodeSelectionKey,
  encodeSelectionKey,
  formatTrytonDate,
  formatTrytonTime,
  normalizeSelectionKey,
  parseTrytonDateInput,
  parseTrytonTimeInput,
  type SelectionKey,
} from "@epiton/view-engine";
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
  key?: string;
  name: string;
  string: string;
  type?: string;
  widget?: string;
  readonly?: boolean;
  relation?: string;
  selection?: Array<[SelectionKey, string]>;
  aggregate?: "sum" | "average";
};

export type TreeRowAction = {
  name: string;
  string?: string;
  type?: string;
  confirm?: string;
};

function cellDisplay(value: unknown, field?: TreeCol): string {
  if (value == null) return "";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  if (field?.widget === "time" || field?.type === "time") return formatTrytonTime(value);
  if (field?.widget === "date" || field?.type === "date") return formatTrytonDate(value);
  if (field?.type === "datetime" || field?.type === "timestamp") {
    return formatTrytonDate(value, true).replace("T", " ");
  }
  return String(value);
}

function EditableCell(props: {
  id: number;
  field: TreeCol;
  value: unknown;
  onCommit: (id: number, field: string, value: unknown) => void;
  onEditRelation?: (id: number, field: TreeCol, value: unknown) => void;
}) {
  const readonly = props.field.readonly || props.field.name === "id";
  const type = props.field.type ?? "char";

  if (type === "many2one" && !readonly && props.onEditRelation) {
    return (
      <button
        type="button"
        className="epiton-tree-m2o"
        aria-label={`Edit ${props.field.string}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onEditRelation?.(props.id, props.field, props.value);
        }}
      >
        {cellDisplay(props.value, props.field) || "Select…"}
      </button>
    );
  }

  if (readonly || type === "many2one" || type === "one2many" || type === "many2many") {
    return <span>{cellDisplay(props.value, props.field)}</span>;
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

  if (type === "selection" && props.field.selection?.length) {
    const selectedKey = normalizeSelectionKey(props.value);
    const selectedValue = selectedKey == null ? "" : encodeSelectionKey(selectedKey);
    return (
      <select
        className="epiton-tree-edit"
        value={selectedValue}
        aria-label={props.field.string}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const next = e.target.value;
          if (selectedValue === next) return;
          const selected = decodeSelectionKey(props.field.selection ?? [], next);
          props.onCommit(props.id, props.field.name, next === "" ? null : selected);
        }}
      >
        <option value="">—</option>
        {props.field.selection
          .filter(([key]) => key !== null)
          .map(([key, label], index) => (
            <option key={`${encodeSelectionKey(key)}-${index}`} value={encodeSelectionKey(key)}>
              {label}
            </option>
          ))}
      </select>
    );
  }

  const temporalWidget =
    props.field.widget === "date" || props.field.widget === "time" ? props.field.widget : undefined;
  if (
    temporalWidget ||
    type === "date" ||
    type === "datetime" ||
    type === "timestamp" ||
    type === "time"
  ) {
    const inputKind =
      temporalWidget ?? (type === "date" ? "date" : type === "time" ? "time" : "datetime");
    const display =
      inputKind === "time"
        ? formatTrytonTime(props.value)
        : formatTrytonDate(props.value, inputKind === "datetime");
    return (
      <input
        className="epiton-tree-edit"
        type={inputKind === "datetime" ? "datetime-local" : inputKind}
        defaultValue={display}
        aria-label={props.field.string}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (display === e.target.value) return;
          const next =
            inputKind === "time"
              ? parseTrytonTimeInput(e.target.value, props.value)
              : parseTrytonDateInput(e.target.value, inputKind === "datetime", props.value);
          props.onCommit(props.id, props.field.name, next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    );
  }

  const inputType =
    type === "integer" || type === "float" || type === "numeric" ? "number" : "text";
  return (
    <input
      className="epiton-tree-edit"
      type={inputType}
      defaultValue={cellDisplay(props.value, props.field)}
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
  rowActions?: TreeRowAction[];
  rowActionsPending?: boolean;
  /** Hierarchy metadata aligned 1:1 with `rows` (after flatten). */
  rowMeta?: Array<{ depth: number; hasChildren: boolean; expanded?: boolean }>;
  onToggleExpand?: (id: number) => void;
  /** Drag sibling onto sibling → reorder callback (Sao sequence). */
  onReorder?: (draggedId: number, targetId: number) => void;
  /** Double-click opens record (keyword_open). */
  onOpen?: (id: number) => void;
  /** When set, sorting is server-driven (no client re-sort). */
  onSortChange?: (sorts: Array<{ id: string; desc: boolean }>) => void;
  onSelect: (id: number) => void;
  onToggleSelect?: (id: number) => void;
  onCellCommit?: (id: number, field: string, value: unknown) => void;
  onEditRelation?: (id: number, field: TreeCol, value: unknown) => void;
  onRowAction?: (id: number, action: TreeRowAction) => void;
  onAddRow?: () => void;
  addRowPlacement?: "top" | "bottom" | null;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const serverSort = Boolean(props.onSortChange);
  const hierarchical = Boolean(props.rowMeta?.length);
  const reorderable = Boolean(props.onReorder);
  const rowActions = props.rowActions ?? [];

  function handleSortingChange(updater: Updater<SortingState>) {
    setSorting((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      props.onSortChange?.(
        next.map((s) => ({
          id: props.columns.find((column) => (column.key ?? column.name) === s.id)?.name ?? s.id,
          desc: Boolean(s.desc),
        })),
      );
      return next;
    });
  }

  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = [];
    if (reorderable) {
      cols.push({
        id: "_drag",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const id = Number(row.original.id);
          return (
            <span
              className="epiton-tree-drag"
              role="button"
              tabIndex={0}
              draggable
              title="Drag to reorder siblings"
              aria-label={`Reorder ${id}`}
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => {
                setDragId(id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(id));
              }}
              onDragEnd={() => setDragId(null)}
            >
              ⋮⋮
            </span>
          );
        },
      });
    }
    if (hierarchical) {
      cols.push({
        id: "_tree",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const id = Number(row.original.id);
          const meta = props.rowMeta?.[row.index];
          const depth = meta?.depth ?? 0;
          const hasChildren = Boolean(meta?.hasChildren);
          return (
            <span className="epiton-tree-indent" style={{ paddingLeft: `${depth * 0.85}rem` }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="epiton-menu-toggle"
                  aria-label={`Expand ${id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onToggleExpand?.(id);
                  }}
                >
                  {meta?.expanded ? "▾" : "▸"}
                </button>
              ) : (
                <span className="epiton-menu-toggle-spacer" />
              )}
            </span>
          );
        },
      });
    }
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
        id: c.key ?? c.name,
        accessorFn: (row) => row[c.name],
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
                onEditRelation={props.onEditRelation}
              />
            );
          }
          return cellDisplay(info.getValue(), c);
        },
      });
    }
    if (rowActions.length && props.onRowAction) {
      cols.push({
        id: "_actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const id = Number(row.original.id);
          return (
            <span className="epiton-tree-row-actions" onClick={(e) => e.stopPropagation()}>
              {rowActions.map((action) => (
                <button
                  key={action.name}
                  type="button"
                  className="epiton-button"
                  disabled={props.rowActionsPending}
                  aria-busy={props.rowActionsPending || undefined}
                  onClick={() => props.onRowAction?.(id, action)}
                >
                  {action.string ?? action.name}
                </button>
              ))}
            </span>
          );
        },
      });
    }
    return cols;
  }, [
    props.columns,
    props.onToggleSelect,
    props.selectedIds,
    props.editable,
    props.onCellCommit,
    props.onEditRelation,
    props.rowMeta,
    props.onToggleExpand,
    props.onRowAction,
    props.rowActionsPending,
    rowActions,
    hierarchical,
    reorderable,
  ]);

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

  const addButton =
    props.onAddRow && props.addRowPlacement ? (
      <button type="button" className="epiton-button" onClick={() => props.onAddRow?.()}>
        New row
      </button>
    ) : null;

  const footerByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of props.columns) {
      if (!col.aggregate) continue;
      let sum = 0;
      let count = 0;
      for (const row of props.rows) {
        const raw = row[col.name];
        const n =
          typeof raw === "number"
            ? raw
            : Array.isArray(raw) && typeof raw[0] === "number"
              ? raw[0]
              : Number(raw);
        if (!Number.isFinite(n)) continue;
        sum += n;
        count += 1;
      }
      if (!count) continue;
      const value = col.aggregate === "average" ? sum / count : sum;
      const label = col.aggregate === "average" ? "avg" : "sum";
      map.set(col.key ?? col.name, `${label} ${formatAgg(value)}`);
    }
    return map;
  }, [props.columns, props.rows]);

  const showFooter = footerByName.size > 0;

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
      {reorderable ? (
        <p className="epiton-tree-editable-hint" role="note">
          Drag ⋮⋮ to reorder siblings (writes sequence)
        </p>
      ) : null}
      {props.addRowPlacement === "top" && addButton ? (
        <div className="epiton-toolbar">{addButton}</div>
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
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  id === props.selectedId
                    ? "bg-[color-mix(in_oklab,var(--epiton-accent)_16%,transparent)]"
                    : "",
                  dragId === id ? "epiton-tree-row-dragging" : "",
                )}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: `repeat(${row.getVisibleCells().length}, minmax(0, 1fr))`,
                }}
                onClick={() => props.onSelect(id)}
                onDoubleClick={() => props.onOpen?.(id)}
                onDragOver={(e) => {
                  if (!reorderable) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (!reorderable) return;
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain") || dragId);
                  setDragId(null);
                  if (Number.isFinite(from) && from !== id) props.onReorder?.(from, id);
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {showFooter ? (
          <tfoot className="epiton-tree-footer sticky bottom-0 bg-[var(--epiton-bg-elevated)]">
            <tr>
              {table.getVisibleLeafColumns().map((col) => (
                <td key={col.id}>{footerByName.get(col.id) ?? ""}</td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
      {props.addRowPlacement === "bottom" && addButton ? (
        <div className="epiton-toolbar">{addButton}</div>
      ) : null}
    </div>
  );
}

function formatAgg(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
