import type { ColumnDef } from "@tanstack/react-table";
import {
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";

export function VirtualPartyTable(props: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ name: string; string: string }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      props.columns.map((c) => ({
        accessorKey: c.name,
        header: c.string,
        cell: (info) => String(info.getValue() ?? ""),
      })),
    [props.columns],
  );

  const table = useReactTable({
    data: props.rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
      <table className="epiton-table w-full">
        <thead className="sticky top-0 bg-[var(--epiton-bg-elevated)] z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="cursor-pointer select-none">
                  <button
                    type="button"
                    className="bg-transparent border-0 p-0 font-inherit text-inherit cursor-pointer"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? null}
                  </button>
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
