import type { MenuItem } from "@epiton/intelligence";
import { Panel } from "@epiton/ui";

/** Mobile-first card layout for adaptive shell. */
export function CardsWorkspace(props: {
  title: string;
  items: Array<{ id: string | number; title: string; subtitle?: string }>;
  onOpen: (id: string | number) => void;
  menus?: MenuItem[];
}) {
  return (
    <div className="grid gap-3">
      <Panel title={props.title}>
        <div className="grid gap-2">
          {props.items.length === 0 ? (
            <p role="status" className="text-[var(--epiton-muted)]">
              No records
            </p>
          ) : (
            props.items.map((item) => (
              <button
                key={String(item.id)}
                type="button"
                className="text-left rounded-xl border border-[var(--epiton-border)] bg-[var(--epiton-bg-elevated)] p-3"
                onClick={() => props.onOpen(item.id)}
              >
                <div className="font-semibold">{item.title}</div>
                {item.subtitle ? (
                  <div className="text-sm text-[var(--epiton-muted)]">{item.subtitle}</div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </Panel>
      {props.menus?.length ? (
        <Panel title="Quick menu">
          <ul className="epiton-menu-list">
            {props.menus.slice(0, 12).map((m) => (
              <li key={m.id}>
                <button type="button">{m.name}</button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
