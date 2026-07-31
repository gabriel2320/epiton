import type { ActionSuggestion, MenuItem, RecentRecord } from "@epiton/intelligence";
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

  const hits = props.search(query || "a", props.menus, recents, 12);

  if (!open) return null;

  return (
    <div className="epiton-command-overlay" role="dialog" aria-label="Command palette">
      <div className="epiton-command">
        <input
          autoFocus
          placeholder="Search menus, actions, records…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <ul>
          {hits.map((h) => (
            <li key={`${h.kind}-${h.label}`}>
              <button
                type="button"
                onClick={() => {
                  props.onPick(h);
                  setOpen(false);
                }}
              >
                <strong>{h.label}</strong>
                <span style={{ color: "var(--epiton-muted)" }}> · {h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setOpen(false)} style={{ marginTop: "0.5rem" }}>
          Close
        </button>
      </div>
    </div>
  );
}
