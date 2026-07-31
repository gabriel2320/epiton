import {
  type MenuItem,
  adaptiveLayout,
  suggestNextActions,
  unifiedSearch,
  workspaceFavorites,
} from "@epiton/intelligence";
import { resolveAction } from "@epiton/protocol";
import { Button } from "@epiton/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { BusBanner } from "../components/BusBanner";
import { CardsWorkspace } from "../components/CardsWorkspace";
import { CommandPalette } from "../components/CommandPalette";
import { ModelWorkspace } from "../components/ModelWorkspace";
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
  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const [wizardActionId, setWizardActionId] = useState<number | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
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
          {
            id: 3,
            name: "Activate modules",
            action: "ir.module.activate_upgrade",
            keywords: ["wizard", "module"],
          },
        ] satisfies MenuItem[];
      }
    },
  });

  const favorites = workspaceFavorites(preset);
  const suggestions = suggestNextActions(history);

  async function openWorkspace(actionOrModel: string, source: string) {
    if (!client) {
      setActive(actionOrModel);
      setActiveWizard(null);
      return;
    }
    setWorkspaceNotice(null);
    const resolved = await resolveAction(client, actionOrModel);
    if (resolved.kind === "model") {
      setActiveWizard(null);
      setWizardActionId(null);
      setActive(resolved.model);
      setHistory((h) => [...h, { model: resolved.model, action: source }]);
      return;
    }
    if (resolved.kind === "wizard") {
      setActiveWizard(resolved.wizard);
      setWizardActionId(resolved.actionId);
      setHistory((h) => [...h, { model: resolved.wizard, action: `wizard:${source}` }]);
      return;
    }
    setWorkspaceNotice(`No workspace for ${actionOrModel}: ${resolved.reason}`);
  }

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
                data-active={active === f && !activeWizard}
                onClick={() => void openWorkspace(f, "favorite")}
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
                  if (m.action) void openWorkspace(m.action, "menu");
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
                  <button
                    type="button"
                    onClick={() => {
                      const model = s.payload.model;
                      if (typeof model === "string") void openWorkspace(model, "suggested");
                    }}
                  >
                    {s.label}
                  </button>
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

        {workspaceNotice ? (
          <p role="status" style={{ color: "var(--epiton-muted)" }}>
            {workspaceNotice}
          </p>
        ) : null}

        {layout.layout === "cards" ? (
          <CardsWorkspace
            title="Records"
            items={(menusQuery.data ?? []).slice(0, 20).map((m) => ({
              id: m.id,
              title: m.name,
              subtitle: m.action ?? undefined,
            }))}
            menus={menusQuery.data ?? []}
            onOpen={(id) => {
              const hit = (menusQuery.data ?? []).find((m) => m.id === id);
              if (hit?.action) void openWorkspace(String(hit.action), "cards");
            }}
          />
        ) : (
          <ModelWorkspace
            key={active}
            model={active}
            useClinicalWidgets={preset === "clinical"}
            onHistory={(action) => setHistory((h) => [...h, { model: active, action }])}
          />
        )}

        <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
          <WizardStepper
            key={activeWizard ?? "manual-wizard"}
            initialWizard={activeWizard}
            actionId={wizardActionId}
            activeModel={active}
            autoStart={Boolean(activeWizard)}
          />
          <AttachmentsPanel model={active} />
          <ReportDownload />
        </div>
      </main>

      <CommandPalette
        menus={menusQuery.data ?? []}
        onPick={(item) => {
          if (item.kind === "menu" && item.payload.action) {
            void openWorkspace(String(item.payload.action), "command");
          } else if (item.kind === "record" && typeof item.payload.model === "string") {
            void openWorkspace(String(item.payload.model), "command");
          }
        }}
        search={unifiedSearch}
      />
    </div>
  );
}
