import {
  type MenuItem,
  adaptiveLayout,
  suggestNextActions,
  unifiedSearch,
  workspaceFavorites,
} from "@epiton/intelligence";
import { Button } from "@epiton/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { BusBanner } from "../components/BusBanner";
import { CommandPalette } from "../components/CommandPalette";
import { PartyWorkspace } from "../components/PartyWorkspace";
import { ReportDownload } from "../components/ReportDownload";
import { WizardStepper } from "../components/WizardStepper";
import { useAppStore } from "../lib/store";

export function Shell() {
  const client = useAppStore((s) => s.client);
  const session = useAppStore((s) => s.session);
  const preset = useAppStore((s) => s.preset);
  const setPreset = useAppStore((s) => s.setPreset);
  const density = useAppStore((s) => s.density);
  const setDensity = useAppStore((s) => s.setDensity);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setSession = useAppStore((s) => s.setSession);
  const setClient = useAppStore((s) => s.setClient);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const [active, setActive] = useState("party.party");
  const [history, setHistory] = useState<Array<{ model: string; action: string }>>([]);

  const layout = useMemo(
    () =>
      adaptiveLayout({
        viewportWidth: typeof window === "undefined" ? 1400 : window.innerWidth,
        preset,
        preferTree: true,
      }),
    [preset],
  );

  const menusQuery = useQuery({
    queryKey: ["menus", session?.userId],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return [] as MenuItem[];
      try {
        const rows = await client.searchRead(
          "ir.ui.menu",
          [["active", "=", true]],
          ["name", "parent", "action"],
          0,
          200,
        );
        return rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? r.id),
          parent: (r.parent as number | null) ?? null,
          action: r.action ? String(r.action) : null,
        })) satisfies MenuItem[];
      } catch {
        return [
          { id: 1, name: "Parties", action: "party.party", keywords: ["party"] },
          { id: 2, name: "Companies", action: "company.company", keywords: ["company"] },
        ] satisfies MenuItem[];
      }
    },
  });

  const favorites = workspaceFavorites(preset);
  const suggestions = suggestNextActions(history);

  async function logout() {
    try {
      await client?.logout();
    } finally {
      setClient(null);
      setSession(null);
    }
  }

  return (
    <div className="epiton-shell" data-layout={layout.layout} data-density={density}>
      <aside className="epiton-sidebar">
        <div className="epiton-brand">Epiton</div>
        <p style={{ color: "var(--epiton-muted)", marginTop: "0.35rem" }}>
          {session?.login} · layout {layout.layout}
        </p>
        <div className="epiton-toolbar" style={{ marginTop: "1rem" }}>
          <Button onClick={() => setCommandOpen(true)}>Command (Ctrl+K)</Button>
        </div>
        <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>Favorites</h3>
        <ul className="epiton-menu-list">
          {favorites.map((f) => (
            <li key={f}>
              <button
                type="button"
                data-active={active === f}
                onClick={() => {
                  setActive(f);
                  setHistory((h) => [...h, { model: f, action: "open" }]);
                }}
              >
                {f}
              </button>
            </li>
          ))}
        </ul>
        <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>Menu</h3>
        <ul className="epiton-menu-list">
          {(menusQuery.data ?? []).slice(0, 40).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  if (m.action)
                    setActive(
                      m.action.includes(",") ? (m.action.split(",")[1] ?? m.name) : m.action,
                    );
                  setHistory((h) => [...h, { model: String(m.action ?? m.name), action: "menu" }]);
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
        {suggestions.length ? (
          <>
            <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>Suggested</h3>
            <ul className="epiton-menu-list">
              {suggestions.map((s) => (
                <li key={s.label}>
                  <button type="button">{s.label}</button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </aside>

      <main className="epiton-main">
        <div className="epiton-topbar">
          <div className="epiton-toolbar">
            <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
              <option value="general">General</option>
              <option value="accounting">Accounting</option>
              <option value="warehouse">Warehouse</option>
              <option value="clinical">Clinical (GH)</option>
            </select>
            <select value={density} onChange={(e) => setDensity(e.target.value as typeof density)}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
            <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              Theme: {theme}
            </Button>
            <BusBanner />
          </div>
          <Button onClick={logout}>Logout</Button>
        </div>

        {active === "party.party" || active.includes("party") ? (
          <PartyWorkspace
            onHistory={(action) => setHistory((h) => [...h, { model: "party.party", action }])}
          />
        ) : (
          <div role="status" style={{ color: "var(--epiton-muted)" }}>
            Workspace for <strong>{active}</strong> uses the same view engine. Open Parties for the
            CRUD reference implementation.
          </div>
        )}

        <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
          <WizardStepper />
          <AttachmentsPanel model="party.party" />
          <ReportDownload />
        </div>
      </main>

      <CommandPalette
        menus={menusQuery.data ?? []}
        onPick={(item) => {
          if (item.kind === "menu" && item.payload.action) {
            setActive(String(item.payload.action));
          }
        }}
        search={unifiedSearch}
      />
    </div>
  );
}
