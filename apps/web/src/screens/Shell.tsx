import { adaptiveLayout, suggestNextActions, unifiedSearch } from "@epiton/intelligence";
import {
  type JsonObject,
  type JsonValue,
  loadMenus,
  openActionUrl,
  resolveAction,
  setMenuFavorite,
  wizardActionRefs,
} from "@epiton/protocol";
import { Button } from "@epiton/ui";
import { parseFieldsViewGet } from "@epiton/view-engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BoardWorkspace } from "../components/BoardWorkspace";
import { BusBanner } from "../components/BusBanner";
import { CardsWorkspace } from "../components/CardsWorkspace";
import { CommandPalette } from "../components/CommandPalette";
import { MenuTree } from "../components/MenuTree";
import { PreferencesPanel } from "../components/PreferencesPanel";
import { ToolDrawer } from "../components/ToolDrawer";
import { workspaceHostForViews } from "../components/modelWorkspace/workspaceNavigation";
import { applyShellDataset, setShellTitle } from "../lib/nativeShell";
import { clearSecureSession } from "../lib/secureSessionBridge";
import { clearClientAuthentication } from "../lib/sessionBoundary";
import { useAppStore } from "../lib/store";
import { composeActionContext } from "./actionContext";

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

function makeTab(frame?: ActionFrame): WorkspaceTab {
  return {
    id: tabId(),
    title: frame?.label || frame?.model || "Workspace",
    stack: frame ? [frame] : [],
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function contextNumber(context: JsonObject | null, key: string): number | null {
  const value = context?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contextNumbers(context: JsonObject | null, key: string): number[] {
  const value = context?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function contextString(context: JsonObject | null, key: string): string | null {
  const value = context?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function actionInvocationContext(
  inheritedContext: JsonObject | undefined,
  actionId: number | null,
): JsonObject | null {
  if (!inheritedContext && actionId == null) return null;
  return {
    ...(inheritedContext ?? {}),
    ...(actionId != null ? { action_id: actionId } : {}),
  };
}

export function Shell() {
  const { t } = useTranslation();
  const client = useAppStore((s) => s.client);
  const session = useAppStore((s) => s.session);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const preset = useAppStore((s) => s.preset);
  const setPreset = useAppStore((s) => s.setPreset);
  const density = useAppStore((s) => s.density);
  const setDensity = useAppStore((s) => s.setDensity);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const connection = useAppStore((s) => s.connection);
  const queryClient = useQueryClient();

  useEffect(() => {
    applyShellDataset();
  }, []);

  const [tabState, setTabState] = useState(() => {
    const tab = makeTab();
    return { tabs: [tab], activeTabId: tab.id };
  });
  const { tabs, activeTabId } = tabState;
  const setActiveTabId = (id: string) => {
    setTabState((prev) => ({ ...prev, activeTabId: id }));
  };
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const stack = activeTab?.stack ?? [];
  const topFrame = stack[stack.length - 1];
  const active = topFrame?.model ?? null;
  const selectedId = topFrame?.id ?? null;
  const workspaceHost = workspaceHostForViews(topFrame?.views);

  useEffect(() => {
    setShellTitle([activeTab?.title ?? "Workspace", session?.login, connection.database, "Epiton"]);
  }, [activeTab?.title, session?.login, connection.database]);

  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const [wizardActionId, setWizardActionId] = useState<number | null>(null);
  const [wizardInvocationContext, setWizardInvocationContext] = useState<JsonObject | null>(null);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [reportInvocationContext, setReportInvocationContext] = useState<JsonObject | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ model: string; action: string }>>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const wizardUsesInvocationSelection = wizardInvocationContext !== null;
  const wizardInheritedId = contextNumber(wizardInvocationContext, "active_id");
  const wizardActiveId = wizardUsesInvocationSelection ? wizardInheritedId : selectedId;
  const wizardActiveIds = useMemo(() => {
    const inheritedIds = contextNumbers(wizardInvocationContext, "active_ids");
    if (inheritedIds.length) return inheritedIds;
    if (wizardInheritedId != null) return [wizardInheritedId];
    if (wizardUsesInvocationSelection) return undefined;
    if (selectedIds.length) return selectedIds;
    return selectedId != null ? [selectedId] : undefined;
  }, [
    wizardInvocationContext,
    wizardInheritedId,
    wizardUsesInvocationSelection,
    selectedId,
    selectedIds,
  ]);
  const wizardActiveModel = wizardUsesInvocationSelection
    ? contextString(wizardInvocationContext, "active_model")
    : active;

  const reportUsesInvocationSelection = reportInvocationContext !== null;
  const reportInheritedId = contextNumber(reportInvocationContext, "active_id");
  const reportActiveIds = useMemo(() => {
    const inheritedIds = contextNumbers(reportInvocationContext, "active_ids");
    if (inheritedIds.length) return inheritedIds;
    if (reportInheritedId != null) return [reportInheritedId];
    if (reportUsesInvocationSelection) return [];
    if (selectedIds.length) return selectedIds;
    return selectedId != null ? [selectedId] : [];
  }, [
    reportInvocationContext,
    reportInheritedId,
    reportUsesInvocationSelection,
    selectedId,
    selectedIds,
  ]);
  const reportActiveModel = reportUsesInvocationSelection
    ? contextString(reportInvocationContext, "active_model")
    : active;
  const reportInitialIds = useMemo(() => reportActiveIds.join(","), [reportActiveIds]);

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
      if (!client) throw new Error("Backend unavailable");
      return loadMenus(client, sessionContext);
    },
  });

  const favorites = useMemo(
    () =>
      (menusQuery.data ?? [])
        .filter((m) => m.favorite && m.action)
        .map((m) => ({ label: m.name, action: String(m.action) })),
    [menusQuery.data],
  );

  const suggestions = suggestNextActions(history);
  const commandRecents = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ model: string; id: number; title: string; at: number }> = [];
    for (let ti = tabs.length - 1; ti >= 0; ti--) {
      const tab = tabs[ti];
      if (!tab) continue;
      for (let fi = tab.stack.length - 1; fi >= 0; fi--) {
        const frame = tab.stack[fi];
        if (!frame || frame.id == null) continue;
        const key = `${frame.model}:${frame.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          model: frame.model,
          id: frame.id,
          title: frame.label ?? `${frame.model}#${frame.id}`,
          at: Date.now() - out.length,
        });
        if (out.length >= 12) return out;
      }
    }
    return out;
  }, [tabs]);

  async function toggleMenuFavorite(id: number, next: boolean) {
    if (!client) {
      setWorkspaceNotice("Backend unavailable; favorite was not changed");
      return;
    }
    try {
      await setMenuFavorite(client, id, next, sessionContext);
      await menusQuery.refetch();
    } catch (error) {
      setWorkspaceNotice(`Favorite was not changed: ${errorMessage(error, "backend error")}`);
    }
  }

  async function prefetchModel(actionOrModel: string) {
    if (!client) return;
    try {
      const resolved = await resolveAction(client, actionOrModel);
      if (resolved.kind !== "model") return;
      const model = resolved.model;
      await queryClient.prefetchQuery({
        queryKey: ["model", model, "tree-view"],
        staleTime: 5 * 60_000,
        queryFn: async () => parseFieldsViewGet(await client.fieldsViewGet(model, null, "tree")),
      });
      await queryClient.prefetchQuery({
        queryKey: ["model", model, "list", "id,rec_name,name,code,active"],
        queryFn: async () => client.searchRead(model, [], ["id", "rec_name", "name"], 0, 40, null),
      });
    } catch (error) {
      setWorkspaceNotice(`Backend prefetch failed: ${errorMessage(error, "unknown error")}`);
    }
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
    const tab = makeTab(frame);
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

  async function openWorkspace(
    actionOrModel: string,
    source: string,
    asNewTab = false,
    inheritedContext?: JsonObject,
  ) {
    if (!client) {
      setWorkspaceNotice("Backend unavailable; action was not opened");
      return;
    }
    setWorkspaceNotice(null);
    const resolved = await resolveAction(client, actionOrModel).catch((error: unknown) => {
      setWorkspaceNotice(`Backend action failed: ${errorMessage(error, "unknown error")}`);
      return null;
    });
    if (!resolved) return;
    if (resolved.kind === "model") {
      setActiveWizard(null);
      setWizardActionId(null);
      setWizardInvocationContext(null);
      setActiveReport(null);
      setReportInvocationContext(null);
      const frame: ActionFrame = {
        model: resolved.model,
        id: null,
        label: resolved.name ?? resolved.model,
        domain: resolved.domain,
        context: composeActionContext(sessionContext, resolved.context, inheritedContext),
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
      setWizardInvocationContext(inheritedContext ?? null);
      setWizardOpen(true);
      setHistory((h) => [...h, { model: resolved.wizard, action: `wizard:${source}` }]);
      return;
    }
    if (resolved.kind === "report") {
      const invocationContext =
        inheritedContext === undefined
          ? null
          : actionInvocationContext(inheritedContext, resolved.actionId);
      const inheritedId = contextNumber(invocationContext, "active_id");
      const inheritedIds = contextNumbers(invocationContext, "active_ids");
      setReportInvocationContext(invocationContext);
      if (
        invocationContext !== null
          ? inheritedId == null && inheritedIds.length === 0
          : selectedId == null && selectedIds.length === 0
      ) {
        setWorkspaceNotice(t("report.selectRecord"));
        setActiveReport(resolved.report);
        setReportOpen(true);
        setHistory((h) => [...h, { model: resolved.report, action: `report:${source}:no-id` }]);
        return;
      }
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
      await clearSecureSession();
      clearClientAuthentication(queryClient);
    }
  }

  return (
    <div className="epiton-shell" data-layout={layout.layout} data-density={density}>
      <aside className="epiton-sidebar" aria-label={t("shell.menu")}>
        <div className="epiton-brand">{t("app.brand")}</div>
        <p style={{ color: "var(--epiton-muted)", marginTop: "0.35rem" }}>
          {session?.login} · layout {layout.layout}
        </p>
        <div className="epiton-toolbar" style={{ marginTop: "1rem" }}>
          <Button onClick={() => setCommandOpen(true)}>{t("shell.command")}</Button>
        </div>
        <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>
          {t("shell.favorites")}
        </h3>
        <ul className="epiton-menu-list">
          {favorites.map((f) => (
            <li key={`${f.label}:${f.action}`}>
              <button
                type="button"
                onMouseEnter={() => void prefetchModel(f.action)}
                onClick={(e) => void openWorkspace(f.action, "favorite", e.metaKey || e.ctrlKey)}
              >
                {f.label}
              </button>
            </li>
          ))}
        </ul>
        <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>{t("shell.menu")}</h3>
        {menusQuery.isLoading ? <p role="status">Loading backend menu…</p> : null}
        {menusQuery.isError ? (
          <p role="alert" style={{ color: "var(--epiton-danger)" }}>
            Backend menu unavailable: {errorMessage(menusQuery.error, "unknown error")}
          </p>
        ) : (
          <MenuTree
            items={menusQuery.data ?? []}
            onOpen={(action) => void openWorkspace(action, "menu")}
            onPrefetch={(action) => void prefetchModel(action)}
            onToggleFavorite={(id, next) => void toggleMenuFavorite(id, next)}
          />
        )}
        {suggestions.length ? (
          <>
            <h3 style={{ fontSize: "0.85rem", color: "var(--epiton-muted)" }}>
              {t("shell.suggested")}
            </h3>
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
            <select
              aria-label="Workspace preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as typeof preset)}
            >
              <option value="general">General</option>
              <option value="accounting">Accounting</option>
              <option value="warehouse">Warehouse</option>
            </select>
            <select
              aria-label="Workspace density"
              value={density}
              onChange={(e) => setDensity(e.target.value as typeof density)}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
            <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {t("shell.theme")}: {theme}
            </Button>
            <BusBanner
              onOpenRecord={(model, id) => {
                setActiveWizard(null);
                setWizardActionId(null);
                setWizardInvocationContext(null);
                setActiveReport(null);
                setReportInvocationContext(null);
                replaceRoot(model, id, { label: `${model}#${id}` });
                setHistory((h) => [...h, { model, action: "bus:open" }]);
              }}
            />
            <ToolDrawer
              open={prefsOpen}
              onOpenChange={setPrefsOpen}
              title={t("shell.prefs")}
              triggerLabel={t("shell.prefs")}
            >
              <PreferencesPanel />
            </ToolDrawer>
            <ToolDrawer
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              title={t("shell.wizard")}
              triggerLabel={t("shell.wizard")}
            >
              <Suspense fallback={<p role="status">Loading wizard…</p>}>
                <WizardStepper
                  key={activeWizard ?? "manual-wizard"}
                  initialWizard={activeWizard}
                  actionId={wizardActionId}
                  initialContext={wizardInvocationContext}
                  activeModel={wizardActiveModel}
                  activeId={wizardActiveId}
                  activeIds={wizardActiveIds}
                  autoStart={Boolean(activeWizard)}
                  onActions={(actions) => {
                    const refs = wizardActionRefs(actions);
                    for (const ref of refs) {
                      void openWorkspace(
                        ref,
                        "wizard-action",
                        false,
                        wizardInvocationContext ?? undefined,
                      );
                    }
                    if (refs.length) setWizardOpen(false);
                  }}
                />
              </Suspense>
            </ToolDrawer>
            <ToolDrawer
              open={reportOpen}
              onOpenChange={setReportOpen}
              title={t("shell.reports")}
              triggerLabel={t("shell.reports")}
            >
              <Suspense fallback={<p role="status">{t("report.loading")}</p>}>
                <ReportDownload
                  initialReport={activeReport}
                  initialContext={reportInvocationContext}
                  initialIds={reportInitialIds}
                  initialModel={reportActiveModel}
                />
              </Suspense>
            </ToolDrawer>
            <ToolDrawer
              open={attachOpen}
              onOpenChange={setAttachOpen}
              title={t("shell.attachments")}
              triggerLabel={t("shell.attachments")}
            >
              <Suspense fallback={<p role="status">Loading attachments…</p>}>
                {active ? (
                  <AttachmentsPanel model={active} recordId={selectedId ?? undefined} />
                ) : (
                  <p role="status">Choose a backend action before opening attachments.</p>
                )}
              </Suspense>
            </ToolDrawer>
          </div>
          <Button onClick={logout}>{t("shell.logout")}</Button>
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
        ) : active && workspaceHost === "board" ? (
          <BoardWorkspace
            key={`${active}:${activeTab?.id}:board`}
            model={active}
            onOpen={(ref, context) => void openWorkspace(ref, "board", false, context)}
            onOpenRecord={(model, id) => {
              setActiveWizard(null);
              setWizardActionId(null);
              setWizardInvocationContext(null);
              setActiveReport(null);
              setReportInvocationContext(null);
              replaceRoot(model, id, { label: `${model}#${id}` });
              setHistory((h) => [...h, { model, action: "board:open-record" }]);
            }}
          />
        ) : active ? (
          <Suspense fallback={<p role="status">Loading workspace…</p>}>
            <ModelWorkspace
              key={`${active}:${activeTab?.id}:${stack.length}`}
              model={active}
              initialSelectedId={selectedId}
              actionDomain={topFrame?.domain}
              actionContext={topFrame?.context}
              actionViews={topFrame?.views}
              actionDomains={topFrame?.domains}
              onSelectedIdChange={(id) => {
                setSelectedId(id);
                if (id == null) setSelectedIds([]);
              }}
              onSelectedIdsChange={setSelectedIds}
              onPushRelated={(model, id) => {
                pushFrame(model, id);
                setHistory((h) => [...h, { model, action: "stack:push" }]);
              }}
              onOpenAction={(ref, source, context) =>
                void openWorkspace(ref, source, false, context)
              }
              onHistory={(action) => setHistory((h) => [...h, { model: active, action }])}
            />
          </Suspense>
        ) : (
          <p role="status">Choose an action from the backend menu.</p>
        )}
      </main>

      <CommandPalette
        menus={menusQuery.data ?? []}
        recents={commandRecents}
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
