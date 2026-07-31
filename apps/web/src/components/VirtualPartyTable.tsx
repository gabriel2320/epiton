import type { ColumnDef } from "@tanstack/react-table";
import {
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { cn } from "../lib/cn";

export function VirtualPartyTable(props: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ name: string; string: string }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

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

  return (
    <div className="max-h-[480px] overflow-auto rounded-xl border border-[var(--epiton-border)]">
      <table className="epiton-table w-full">
        <thead className="sticky top-0 bg-[var(--epiton-bg-elevated)]">
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
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const id = Number(row.original.id);
            return (
              <tr
                key={row.id}
                className={cn(selectedClass(id === props.selectedId))}
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

function selectedClass(selected: boolean): string {
  return selected ? "bg-[color-mix(in_oklab,var(--epiton-accent)_16%,transparent)]" : "";
}
