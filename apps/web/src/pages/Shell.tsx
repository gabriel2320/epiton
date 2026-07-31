import {
  type MenuItem,
  adaptiveLayout,
  suggestNextActions,
  unifiedSearch,
  workspaceFavorites,
} from "@epiton/intelligence";
import { type JsonValue, openActionUrl, resolveAction, wizardActionRefs } from "@epiton/protocol";
import { Button } from "@epiton/ui";
import { parseFieldsViewGet } from "@epiton/view-engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { BoardWorkspace } from "../components/BoardWorkspace";
import { BusBanner } from "../components/BusBanner";
import { CardsWorkspace } from "../components/CardsWorkspace";
import { CommandPalette } from "../components/CommandPalette";
import { MenuTree } from "../components/MenuTree";
import { PreferencesPanel } from "../components/PreferencesPanel";
import { ToolDrawer } from "../components/ToolDrawer";
import { readDeepLink, writeDeepLink } from "../lib/deeplink";
import { applyShellDataset, setShellTitle } from "../lib/nativeShell";
import { clearSecureSession } from "../lib/secureSessionBridge";
import { useAppStore } from "../lib/store";

const ModelWorkspace = lazy(() =>
  import("../components/ModelWorkspace").then((m) => ({ default: m.ModelWorkspace })),
);
const WizardStepper = lazy(() =>
  import("../components/WizardStepper").then((m) => ({ default: m.WizardStepper })),
);
const AttachmentsPanel = lazy(() =>
  import("../components/AttachmentsPanel").then((m) => ({ default: m.AttachmentsPanel })),
);
const ReportDownload = lazy(() =>
  import("../components/ReportDownload").then((m) => ({ default: m.ReportDownload })),
);

interface ActionFrame {
  model: string;
  id: number | null;
  label: string;
  domain?: JsonValue;
  context?: JsonValue;
  views?: Array<[number | null, string]>;
  domains?: Array<{ name: string; domain: JsonValue; count?: boolean }>;
}

interface WorkspaceTab {
  id: string;
  title: string;
  stack: ActionFrame[];
}

function tabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function isBoardViews(views?: Array<[number | null, string]>): boolean {
  if (!views?.length) return false;
  return views[0]?.[1] === "board" || views.every(([, mode]) => mode === "board");
}

function makeTab(frame: ActionFrame): WorkspaceTab {
  return { id: tabId(), title: frame.label || frame.model, stack: [frame] };
}

export function Shell() {
  const client = useAppStore((s) => s.client);
  const session = useAppStore((s) => s.session);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const preset = useAppStore((s) => s.preset);
  const setPreset = useAppStore((s) => s.setPreset);
  const density = useAppStore((s) => s.density);
  const setDensity = useAppStore((s) => s.setDensity);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setSession = useAppStore((s) => s.setSession);
  const setClient = useAppStore((s) => s.setClient);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const connection = useAppStore((s) => s.connection);
  const queryClient = useQueryClient();

  useEffect(() => {
    applyShellDataset();
  }, []);

  const deep = readDeepLink();
  const [tabState, setTabState] = useState(() => {
    const tab = makeTab({
      model: deep.model ?? "party.party",
      id: deep.id,
      label: deep.model ?? "party.party",
    });
    return { tabs: [tab], activeTabId: tab.id };
  });
  const { tabs, activeTabId } = tabState;
  const setTabs = (updater: WorkspaceTab[] | ((prev: WorkspaceTab[]) => WorkspaceTab[])) => {
    setTabState((prev) => ({
      ...prev,
      tabs: typeof updater === "function" ? updater(prev.tabs) : updater,
    }));
  };
  const setActiveTabId = (id: string) => {
    setTabState((prev) => ({ ...prev, activeTabId: id }));
  };
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const stack = activeTab?.stack ?? [
    {
      model: deep.model ?? "party.party",
      id: deep.id,
      label: deep.model ?? "party.party",
    },
  ];
  const active = stack[stack.length - 1]?.model ?? "party.party";
  const selectedId = stack[stack.length - 1]?.id ?? null;
  const topFrame = stack[stack.length - 1];
  const boardMode = isBoardViews(topFrame?.views);

  useEffect(() => {
    setShellTitle([activeTab?.title ?? active, session?.login, connection.database, "Epiton"]);
  }, [activeTab?.title, active, session?.login, connection.database]);

  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const [wizardActionId, setWizardActionId] = useState<number | null>(null);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ model: string; action: string }>>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  function updateActiveTab(mutator: (tab: WorkspaceTab) => WorkspaceTab) {
    setTabState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        tab.id === (activeTab?.id ?? prev.activeTabId) ? mutator(tab) : tab,
      ),
    }));
  }

  function setStack(next: ActionFrame[] | ((s: ActionFrame[]) => ActionFrame[])) {
    updateActiveTab((tab) => {
      const stackNext = typeof next === "function" ? next(tab.stack) : next;
      const top = stackNext[stackNext.length - 1];
      return {
        ...tab,
        stack: stackNext,
        title: top?.label ?? top?.model ?? tab.title,
      };
    });
  }

  function setSelectedId(id: number | null) {
    setStack((s) => {
      if (!s.length) return s;
      const copy = [...s];
      const top = copy[copy.length - 1];
      if (!top) return s;
      copy[copy.length - 1] = { ...top, id };
      return copy;
    });
  }

  useEffect(() => {
    writeDeepLink(active, selectedId);
  }, [active, selectedId]);

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
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) return [] as MenuItem[];
      try {
        const rows = await client.searchRead(
          "ir.ui.menu",
          [["active", "=", true]],
          ["name", "parent", "action", "favorite"],
          0,
          200,
        );
        return rows.map((r) => {
          const parentRaw = r.parent;
          const parent =
            typeof parentRaw === "number"
              ? parentRaw
              : Array.isArray(parentRaw) && typeof parentRaw[0] === "number"
                ? parentRaw[0]
                : null;
          return {
            id: Number(r.id),
            name: String(r.name ?? r.id),
            parent,
            action: r.action ? String(r.action) : null,
            favorite: Boolean(r.favorite),
          } satisfies MenuItem;
        });
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

  const favorites = useMemo(() => {
    const server = (menusQuery.data ?? [])
      .filter((m) => m.favorite && m.action)
      .map((m) => ({ label: m.name, action: String(m.action) }));
    if (server.length) return server;
    return workspaceFavorites(preset).map((f) => ({ label: f, action: f }));
  }, [menusQuery.data, preset]);

  const suggestions = suggestNextActions(history);

  async function toggleMenuFavorite(id: number, next: boolean) {
    if (!client) return;
    try {
      await client.model("ir.ui.menu", "write", [[id], { favorite: next }], sessionContext);
      await menusQuery.refetch();
    } catch {
      /* ACL may block menu writes — ignore */
    }
  }

  async function prefetchModel(actionOrModel: string) {
    if (!client) return;
    const resolved = await resolveAction(client, actionOrModel);
    if (resolved.kind !== "model") return;
    const model = resolved.model;
    await queryClient.prefetchQuery({
      queryKey: ["model", model, "tree-view"],
      staleTime: 5 * 60_000,
      queryFn: async () => {
        try {
          return parseFieldsViewGet(await client.fieldsViewGet(model, null, "tree"));
        } catch {
          return null;
        }
      },
    });
    await queryClient.prefetchQuery({
      queryKey: ["model", model, "list", "id,rec_name,name,code,active"],
      queryFn: async () => client.searchRead(model, [], ["id", "rec_name", "name"], 0, 40, null),
    });
  }

  function replaceRoot(
    model: string,
    id: number | null = null,
    extras?: {
      domain?: JsonValue;
      context?: JsonValue;
      views?: Array<[number | null, string]>;
      domains?: ActionFrame["domains"];
      label?: string;
    },
  ) {
    setStack([
      {
        model,
        id,
        label: extras?.label ?? model,
        domain: extras?.domain,
        context: extras?.context,
        views: extras?.views,
        domains: extras?.domains,
      },
    ]);
  }

  function pushFrame(model: string, id: number | null) {
    setStack((s) => [...s, { model, id, label: id != null ? `${model}#${id}` : model }]);
  }

  function popTo(index: number) {
    setStack((s) => s.slice(0, index + 1));
  }

  function openNewTab(frame?: ActionFrame) {
    const tab = makeTab(frame ?? { model: "party.party", id: null, label: "party.party" });
    setTabState((prev) => ({
      tabs: [...prev.tabs, tab],
      activeTabId: tab.id,
    }));
  }

  function closeTab(id: string) {
    setTabState((prev) => {
      if (prev.tabs.length <= 1) return prev;
      const nextTabs = prev.tabs.filter((t) => t.id !== id);
      const nextActive =
        prev.activeTabId === id
          ? (nextTabs[nextTabs.length - 1]?.id ?? nextTabs[0]?.id ?? prev.activeTabId)
          : prev.activeTabId;
      return { tabs: nextTabs, activeTabId: nextActive };
    });
  }

  const openNewTabRef = useRef(openNewTab);
  openNewTabRef.current = openNewTab;
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;
  const activeTabIdRef = useRef(activeTab?.id);
  activeTabIdRef.current = activeTab?.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "t") {
        e.preventDefault();
        openNewTabRef.current();
        return;
      }
      if (key === "w") {
        e.preventDefault();
        const id = activeTabIdRef.current;
        if (id) closeTabRef.current(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openWorkspace(actionOrModel: string, source: string, asNewTab = false) {
    if (!client) {
      if (asNewTab) openNewTab({ model: actionOrModel, id: null, label: actionOrModel });
      else replaceRoot(actionOrModel);
      setActiveWizard(null);
      return;
    }
    setWorkspaceNotice(null);
    const resolved = await resolveAction(client, actionOrModel);
    if (resolved.kind === "model") {
      setActiveWizard(null);
      setWizardActionId(null);
      setActiveReport(null);
      const frame: ActionFrame = {
        model: resolved.model,
        id: null,
        label: resolved.name ?? resolved.model,
        domain: resolved.domain,
        context: resolved.context,
        views: resolved.views,
        domains: resolved.domains,
      };
      if (asNewTab) openNewTab(frame);
      else replaceRoot(resolved.model, null, frame);
      setHistory((h) => [...h, { model: resolved.model, action: source }]);
      return;
    }
    if (resolved.kind === "wizard") {
      setActiveWizard(resolved.wizard);
      setWizardActionId(resolved.actionId);
      setWizardOpen(true);
      setHistory((h) => [...h, { model: resolved.wizard, action: `wizard:${source}` }]);
      return;
    }
    if (resolved.kind === "report") {
      setActiveReport(resolved.report);
      setReportOpen(true);
      setHistory((h) => [...h, { model: resolved.report, action: `report:${source}` }]);
      return;
    }
    if (resolved.kind === "url") {
      const ok = openActionUrl(resolved.url);
      setWorkspaceNotice(
        ok
          ? `Opened URL: ${resolved.name ?? resolved.url}`
          : `Blocked or failed URL action: ${resolved.url}`,
      );
      setHistory((h) => [...h, { model: resolved.url, action: `url:${source}` }]);
      return;
    }
    setWorkspaceNotice(`No workspace for ${actionOrModel}: ${resolved.reason}`);
  }

  async function logout() {
    try {
      await client?.logout();
    } finally {
      void clearSecureSession();
      setClient(null);
      setSession(null);
      useAppStore.getState().setPreferences({}, {});
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
            <li key={`${f.label}:${f.action}`}>
              <button
                type="button"
                data-active={active === f.action && !activeWizard}
                onMouseEnter={() => void prefetchModel(f.action)}
                onClick={(e) => void openWorkspace(f.action, "favorite", e.metaKey || e.ctrlKey)}
              >
                {f.label}
              </button>
            </li>
          ))}
        </ul>
        <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>Menu</h3>
        <MenuTree
          items={menusQuery.data ?? []}
          onOpen={(action) => void openWorkspace(action, "menu")}
          onPrefetch={(action) => void prefetchModel(action)}
          onToggleFavorite={(id, next) => void toggleMenuFavorite(id, next)}
        />
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
            <BusBanner
              onOpenRecord={(model, id) => {
                setActiveWizard(null);
                setWizardActionId(null);
                setActiveReport(null);
                replaceRoot(model, id, { label: `${model}#${id}` });
                setHistory((h) => [...h, { model, action: "bus:open" }]);
              }}
            />
            <ToolDrawer
              open={prefsOpen}
              onOpenChange={setPrefsOpen}
              title="Preferences"
              triggerLabel="Prefs"
            >
              <PreferencesPanel />
            </ToolDrawer>
            <ToolDrawer
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              title="Wizard"
              triggerLabel="Wizard"
            >
              <Suspense fallback={<p role="status">Loading wizard…</p>}>
                <WizardStepper
                  key={activeWizard ?? "manual-wizard"}
                  initialWizard={activeWizard}
                  actionId={wizardActionId}
                  activeModel={active}
                  activeId={selectedId}
                  autoStart={Boolean(activeWizard)}
                  onActions={(actions) => {
                    const refs = wizardActionRefs(actions);
                    for (const ref of refs) void openWorkspace(ref, "wizard-action");
                    if (refs.length) setWizardOpen(false);
                  }}
                />
              </Suspense>
            </ToolDrawer>
            <ToolDrawer
              open={reportOpen}
              onOpenChange={setReportOpen}
              title="Reports"
              triggerLabel="Reports"
            >
              <Suspense fallback={<p role="status">Loading reports…</p>}>
                <ReportDownload
                  initialReport={activeReport}
                  initialIds={selectedId != null ? String(selectedId) : "1"}
                />
              </Suspense>
            </ToolDrawer>
            <ToolDrawer
              open={attachOpen}
              onOpenChange={setAttachOpen}
              title="Attachments"
              triggerLabel="Attachments"
            >
              <Suspense fallback={<p role="status">Loading attachments…</p>}>
                <AttachmentsPanel model={active} recordId={selectedId ?? undefined} />
              </Suspense>
            </ToolDrawer>
          </div>
          <Button onClick={logout}>Logout</Button>
        </div>

        <div className="epiton-tabs" role="tablist" aria-label="Workspace tabs">
          {tabs.map((tab) => (
            <div key={tab.id} className="epiton-tab" data-active={tab.id === activeTab?.id}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab?.id}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.title}
              </button>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  className="epiton-tab-close"
                  aria-label={`Close ${tab.title}`}
                  onClick={() => closeTab(tab.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          <Button onClick={() => openNewTab()} aria-label="New tab">
            + Tab
          </Button>
        </div>

        <nav className="epiton-breadcrumbs" aria-label="Action stack">
          {stack.map((frame, index) => (
            <span key={`${frame.model}-${index}`}>
              {index > 0 ? <span aria-hidden="true"> / </span> : null}
              <button
                type="button"
                className="epiton-breadcrumb"
                data-active={index === stack.length - 1}
                onClick={() => popTo(index)}
              >
                {frame.id != null ? `${frame.model} #${frame.id}` : frame.label}
              </button>
            </span>
          ))}
          {stack.length > 1 ? (
            <Button
              onClick={() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))}
              aria-label="Back"
            >
              Back
            </Button>
          ) : null}
        </nav>

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
        ) : boardMode ? (
          <BoardWorkspace
            key={`${active}:${activeTab?.id}:board`}
            model={active}
            onOpen={(ref) => void openWorkspace(ref, "board")}
            onOpenRecord={(model, id) => {
              setActiveWizard(null);
              setWizardActionId(null);
              setActiveReport(null);
              replaceRoot(model, id, { label: `${model}#${id}` });
              setHistory((h) => [...h, { model, action: "board:open-record" }]);
            }}
          />
        ) : (
          <Suspense fallback={<p role="status">Loading workspace…</p>}>
            <ModelWorkspace
              key={`${active}:${activeTab?.id}:${stack.length}`}
              model={active}
              initialSelectedId={selectedId}
              actionDomain={topFrame?.domain}
              actionContext={topFrame?.context}
              actionViews={topFrame?.views}
              actionDomains={topFrame?.domains}
              useClinicalWidgets={preset === "clinical"}
              onSelectedIdChange={setSelectedId}
              onPushRelated={(model, id) => {
                pushFrame(model, id);
                setHistory((h) => [...h, { model, action: "stack:push" }]);
              }}
              onOpenAction={(ref, source) => void openWorkspace(ref, source)}
              onHistory={(action) => setHistory((h) => [...h, { model: active, action }])}
            />
          </Suspense>
        )}
      </main>

      <CommandPalette
        menus={menusQuery.data ?? []}
        onPick={(item) => {
          if (item.kind === "menu" && item.payload.action) {
            void openWorkspace(String(item.payload.action), "command");
          } else if (item.kind === "record" && typeof item.payload.model === "string") {
            void openWorkspace(String(item.payload.model), "command");
            if (typeof item.payload.id === "number") setSelectedId(item.payload.id);
          }
        }}
        search={unifiedSearch}
      />
    </div>
  );
}
