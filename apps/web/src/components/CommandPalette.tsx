import type { ActionSuggestion, MenuItem, RecentRecord } from "@epiton/intelligence";
import { Command } from "cmdk";
import { useMemo, useState } from "react";
import { useAppStore } from "../lib/store";

export function CommandPalette(props: {
  menus: MenuItem[];
  onPick: (item: ActionSuggestion) => void;
  search: (
    query: string,
    menus: MenuItem[],
    recents: RecentRecord[],
    limit?: number,
  ) => ActionSuggestion[];
}) {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const [query, setQuery] = useState("");
  const recents = useMemo<RecentRecord[]>(
    () => [{ model: "party.party", id: 1, title: "Sample party", at: Date.now() }],
    [],
  );

  const hits = props.search(query, props.menus, recents, 12);

  if (!open) return null;

  return (
    <div className="epiton-command-overlay">
      <Command
        className="epiton-command"
        label="Command palette"
        shouldFilter={false}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Command.Input
          autoFocus
          placeholder="Search menus, actions, records…"
          value={query}
          onValueChange={setQuery}
        />
        <Command.List>
          <Command.Empty>No results</Command.Empty>
          {hits.map((h) => (
            <Command.Item
              key={`${h.kind}-${h.label}-${String(h.payload.id ?? "")}`}
              value={h.label}
              onSelect={() => {
                props.onPick(h);
                setOpen(false);
                setQuery("");
              }}
            >
              <strong>{h.label}</strong>
              <span style={{ color: "var(--epiton-muted)" }}> · {h.kind}</span>
            </Command.Item>
          ))}
        </Command.List>
        <button type="button" onClick={() => setOpen(false)} style={{ marginTop: "0.5rem" }}>
          Close
        </button>
      </Command>
    </div>
  );
}
