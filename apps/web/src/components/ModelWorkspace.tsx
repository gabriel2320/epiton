import { strictAclCoach } from "@epiton/intelligence";
import {
  type ActWindowDomainTab,
  type JsonObject,
  type JsonValue,
  READ_ONLY_MODEL_ACCESS,
  type ViewSearchRow,
  copyRecords,
  createViewSearch,
  deleteViewSearch,
  exportModelCsv,
  getKeywords,
  getModelAccess,
  importModelCsv,
  loadTreeState,
  loadViewSearches,
  modelHasAccessRows,
  saveTreeState,
  viewIdForMode,
} from "@epiton/protocol";
import { Alert, Button, ConfirmDialog, MetaStrip, Panel, StateBlock } from "@epiton/ui";
import {
  type ChildScreenExitDecision,
  type RecordValues,
  type ViewField,
  aggregateGraphData,
  evalContext,
  evalDomain,
  flattenTreeRows,
  formatOrder,
  hydrateMany2OneRows,
  inferGraphFields,
  mergeDomains,
  mergeTreeRows,
  parseCalendarArch,
  parseFieldsViewGet,
  parseGraphArch,
  parseSearchDomain,
  renderView,
  rowsToCalendarEvents,
  rowsToMultiSeries,
  sequenceWrites,
  siblingReorderIds,
  summarizeSeries,
  treeButtons,
  treeColumns,
  treeEditable,
  treeEditablePlacement,
  treeMeta,
  withMany2OneRecNames,
} from "@epiton/view-engine";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { backendRpcContextKey, invalidateModelProjections } from "../lib/backendTruth";
import { guessMime } from "../lib/mime";
import {
  type RelationCommandQueue,
  type ScreenState,
  createRelationQueue,
  createScreen,
  hydrateSelectedScreen,
  isScreenReadyToSave,
  screenForSelection,
  screenIsDirty,
  screenTrytonTimestamps,
  setScreenRelationQueue,
  trytonTimestampsForRecords,
  updateScreenValues,
  withTrytonTimestampContext,
} from "../lib/screen";
import { useAppStore } from "../lib/store";
import { CalendarView } from "./CalendarView";
import { CsvExportDialog } from "./CsvExportDialog";
import { CsvImportDialog, applyCsvColumnMapping } from "./CsvImportDialog";
import { EmailComposeDialog } from "./EmailComposeDialog";
import { GraphView } from "./GraphView";
import { ListFormView } from "./ListFormView";
import { RecordHistoryPanel } from "./RecordHistoryPanel";
import { RelationLinesEditor } from "./RelationLinesEditor";
import { RelationSearch } from "./RelationSearch";
import { VirtualPartyTable } from "./VirtualPartyTable";
import {
  WorkspaceKeywordActions,
  WorkspaceListActionToolbar,
  WorkspaceRecordActionToolbar,
} from "./modelWorkspace/WorkspaceActionToolbars";
import {
  WorkspaceDomainTabs,
  WorkspaceSearchControls,
} from "./modelWorkspace/WorkspaceSearchControls";
import { actionDomainDefaults, hydrateDefaultMany2OneNames } from "./modelWorkspace/actionDefaults";
import { buttonRpcContext, isActionButton } from "./modelWorkspace/actionToolbar";
import { beginButtonFlight, finishButtonFlight } from "./modelWorkspace/buttonFlight";
import {
  adjacentSelectedId,
  effectiveSelectedIds,
  externalSelectionNeedsSync,
  listSelectionTransition,
  screenAfterListSelection,
  toggleSelectedId,
} from "./modelWorkspace/listSelection";
import {
  type OnChangeWork,
  type RecordLifecycleRefs,
  handleFieldChange as applyRecordFieldChange,
  bumpScreenGeneration as bumpRecordScreenGeneration,
  flushPendingOnChange as flushRecordOnChange,
  replaceDraft as replaceRecordDraft,
  scheduleOnChange as scheduleRecordOnChange,
} from "./modelWorkspace/recordLifecycle";
import {
  leaveWriteModeTransition,
  readRecordSnapshot,
  saveRecord,
  screenAfterDiscard,
  screenAfterNewDefaults,
} from "./modelWorkspace/recordSave";
import {
  type WorkspaceListViewMode,
  actionHasViewMode,
  initialWorkspaceViewMode,
} from "./modelWorkspace/workspaceNavigation";
import {
  activeWorkspaceTabDomain,
  savedSearchText,
  workspaceListDomainResult,
} from "./modelWorkspace/workspaceSearch";
import { noticeTone } from "./modelWorkspace/workspaceUi";

const DEFAULT_FIELDS = ["id", "rec_name", "name", "code", "active"];
const PAGE_SIZE_OPTIONS = [40, 80, 120, 200] as const;

/** Generic Tryton model workspace — opens any model via fields_view_get + CRUD.
 * Remount with `key={model}` from the shell when switching models.
 */
export function ModelWorkspace(props: {
  model: string;
  initialSelectedId?: number | null;
  /** Domain from ir.action.act_window (may still contain PYSON). */
  actionDomain?: JsonValue;
  actionContext?: JsonValue;
  actionViews?: Array<[number | null, string]>;
  actionDomains?: ActWindowDomainTab[];
  onHistory?: (action: string) => void;
  onSelectedIdChange?: (id: number | null) => void;
  /** Multi-select ids for wizard active_ids / bulk context. */
  onSelectedIdsChange?: (ids: number[]) => void;
  onPushRelated?: (model: string, id: number | null) => void;
  /** Open keyword / related action refs in the shell. */
  onOpenAction?: (ref: string, source: string, context?: JsonObject) => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const session = useAppStore((s) => s.session);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(props.initialSelectedId ?? null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mode, setMode] = useState<"read" | "write">("read");
  const [screen, setScreen] = useState<ScreenState>(() =>
    createScreen(props.model, props.initialSelectedId ?? null),
  );
  const draft = screen.values;
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [relationDomain, setRelationDomain] = useState<unknown[] | undefined>(undefined);
  const [hasOpenRelationDraft, setHasOpenRelationDraft] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<WorkspaceListViewMode>(() =>
    initialWorkspaceViewMode(props.actionViews),
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(80);
  const [domainTab, setDomainTab] = useState(-1);
  const [sorts, setSorts] = useState<Array<{ id: string; desc: boolean }>>([]);
  const [forceTreeEdit, setForceTreeEdit] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[] | null>(null);
  const [csvImportText, setCsvImportText] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedTreeIds, setExpandedTreeIds] = useState<Set<number>>(() => new Set());
  const [lazyTreeRows, setLazyTreeRows] = useState<Array<Record<string, unknown>>>([]);
  const [emptyTreeParents, setEmptyTreeParents] = useState<Set<number>>(() => new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const [csvExportOpen, setCsvExportOpen] = useState(false);
  const [savedSearchDialog, setSavedSearchDialog] = useState<"save" | "delete" | null>(null);
  const [onChangePending, setOnChangePending] = useState(false);
  const [buttonFlight, setButtonFlight] = useState<string | null>(null);
  const [newDefaultsGeneration, setNewDefaultsGeneration] = useState<number | null>(null);
  const [hiddenOptionalCols, setHiddenOptionalCols] = useState<Record<string, boolean>>({});
  const [treeM2O, setTreeM2O] = useState<{
    id: number;
    field: ViewField;
  } | null>(null);
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef(screen);
  const selectedIdRef = useRef(selectedId);
  const screenGenerationRef = useRef(0);
  const onChangeRevisionRef = useRef(0);
  const onChangeWorkRef = useRef<OnChangeWork | null>(null);
  const dirtyRef = useRef(false);
  const openRelationDraftRef = useRef(false);
  const buttonFlightRef = useRef<string | null>(null);
  const keyHandlersRef = useRef<{
    startNew: () => Promise<void>;
    requestDelete: (ids: number[]) => void;
    confirmDiscard: () => boolean;
    selectAdjacent: (delta: -1 | 1) => void;
  }>({
    startNew: async () => {},
    requestDelete: (_ids: number[]) => {},
    confirmDiscard: () => true,
    selectAdjacent: (_delta: -1 | 1) => {},
  });
  screenRef.current = screen;
  selectedIdRef.current = selectedId;
  const newDefaultsPending = newDefaultsGeneration === screenGenerationRef.current;
  const recordLifecycleRefs = useMemo<RecordLifecycleRefs>(
    () => ({
      timer: onChangeTimer,
      screen: screenRef,
      generation: screenGenerationRef,
      revision: onChangeRevisionRef,
      work: onChangeWorkRef,
    }),
    [],
  );

  function replaceDraft(values: RecordValues) {
    replaceRecordDraft(recordLifecycleRefs, setScreen, values);
  }

  const actionCtxOverlay = useMemo(
    () => evalContext(props.actionContext ?? {}, sessionContext),
    [props.actionContext, sessionContext],
  );

  const rpcContext: JsonObject = useMemo(
    () => ({ ...sessionContext, ...actionCtxOverlay }) as JsonObject,
    [sessionContext, actionCtxOverlay],
  );
  const rpcScope = backendRpcContextKey(rpcContext);

  const viewSearchesQuery = useQuery({
    queryKey: ["view-search", props.model, session?.userId, rpcScope],
    enabled: Boolean(client && session?.userId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client || !session) return [];
      return loadViewSearches(client, props.model, session.userId, rpcContext);
    },
  });

  const treeViewId = viewIdForMode(props.actionViews, "tree");
  const formViewId = viewIdForMode(props.actionViews, "form");
  const calendarViewId = viewIdForMode(props.actionViews, "calendar");
  const hasCalendarView = actionHasViewMode(props.actionViews, "calendar");
  const listFormViewId = viewIdForMode(props.actionViews, "list-form");
  const graphViewId = viewIdForMode(props.actionViews, "graph");

  function bumpScreenGeneration() {
    bumpRecordScreenGeneration(recordLifecycleRefs, setOnChangePending);
  }

  function leaveWriteMode() {
    const transition = leaveWriteModeTransition(mode);
    if (transition.bumpGeneration) bumpScreenGeneration();
    setMode(transition.mode);
  }

  const handleRelationExitDecision = useCallback((decision: ChildScreenExitDecision) => {
    const next = decision.kind === "confirm-discard";
    openRelationDraftRef.current = next;
    setHasOpenRelationDraft((current) => (current === next ? current : next));
  }, []);

  const closeRelationEditor = useCallback(() => {
    openRelationDraftRef.current = false;
    setHasOpenRelationDraft(false);
    setRelationField(null);
    setRelationDomain(undefined);
  }, []);

  function confirmDiscard(): boolean {
    if (!dirtyRef.current && !openRelationDraftRef.current) return true;
    if (
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(t("workspace.discardConfirm"))
    ) {
      return false;
    }
    closeRelationEditor();
    return true;
  }

  function selectId(id: number | null, committed = false): boolean {
    const transition = listSelectionTransition(selectedId, id, committed);
    if (transition.confirmDiscard && !confirmDiscard()) return false;
    if (transition.resetScreen) {
      closeRelationEditor();
      bumpScreenGeneration();
      setScreen((current) => screenAfterListSelection(current, props.model, transition));
    }
    setSelectedId(id);
    props.onSelectedIdChange?.(id);
    return true;
  }

  function setMultiSelect(ids: number[]) {
    setSelectedIds(ids);
    props.onSelectedIdsChange?.(ids);
  }

  async function openKeywordAction(
    keyword: "tree_open" | "graph_open",
    recordId: number,
    source: string,
  ): Promise<boolean> {
    if (!client || !props.onOpenAction) return false;
    try {
      const actions = await getKeywords(client, keyword, props.model, recordId, rpcContext);
      const hit = actions[0];
      if (!hit) return false;
      props.onOpenAction(
        hit.ref,
        source,
        buttonRpcContext(mutationContextForIds(rpcContext, [recordId]), props.model, [recordId]),
      );
      props.onHistory?.(source);
      return true;
    } catch {
      return false;
    }
  }

  function downloadCsvBlob(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCsv(fields?: string[]) {
    if (!client) return;
    if (!listDomainResult.ok) {
      setNotice(listDomainResult.error);
      return;
    }
    setNotice("Exporting CSV…");
    try {
      const fieldNames = fields?.length ? fields : columns.map((c) => c.name).filter(Boolean);
      const effectiveIds = effectiveSelectedIds(selectedIds, selectedId);
      const ids = effectiveIds.length > 0 ? effectiveIds : undefined;
      const csv = await exportModelCsv(client, props.model, {
        ids,
        fields: fieldNames.length ? fieldNames : ["id", "rec_name"],
        domain: (listDomain as JsonValue[]) ?? [],
        context: rpcContext,
      });
      downloadCsvBlob(`${props.model}.csv`, csv);
      setNotice(`Exported ${ids?.length ? ids.length : "domain"} row(s)`);
      props.onHistory?.("export_csv");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function importCsvFile(file: File) {
    if (!client || !modelAccess.create) return;
    try {
      const text = await file.text();
      setCsvImportText(text);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to read CSV");
    }
  }

  async function confirmCsvImport(mapping: string[]) {
    if (!client || !modelAccess.create || !csvImportText) return;
    setNotice("Importing CSV…");
    try {
      const { fields, dataCsv } = applyCsvColumnMapping(csvImportText, mapping);
      if (!fields.length) throw new Error("No columns mapped");
      const count = await importModelCsv(client, props.model, dataCsv, {
        fields,
        header: false,
        context: rpcContext,
      });
      setCsvImportText(null);
      setNotice(`Imported ${count} record(s)`);
      props.onHistory?.("import_csv");
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function copySelected() {
    if (!client || !modelAccess.create) return;
    const ids = effectiveSelectedIds(selectedIds, selectedId);
    if (!ids.length) return;
    setNotice("Copying…");
    try {
      const created = await copyRecords(
        client,
        props.model,
        ids,
        {},
        mutationContextForIds(rpcContext, ids),
      );
      setNotice(`Copied → ${created.join(", ") || "ok"}`);
      props.onHistory?.("copy");
      await invalidateModelProjections(queryClient);
      if (created[0] != null) {
        selectId(created[0]);
        setMode(modelAccess.write ? "write" : "read");
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Copy failed");
    }
  }

  const formViewQuery = useQuery({
    queryKey: ["model", props.model, "form-view", formViewId, rpcScope],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      return parseFieldsViewGet(
        await client.fieldsViewGet(props.model, formViewId, "form", rpcContext),
      );
    },
  });

  const treeViewQuery = useQuery({
    queryKey: ["model", props.model, "tree-view", treeViewId, rpcScope],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      return parseFieldsViewGet(
        await client.fieldsViewGet(props.model, treeViewId, "tree", rpcContext),
      );
    },
  });

  const calendarViewQuery = useQuery({
    queryKey: ["model", props.model, "calendar-view", calendarViewId, rpcScope],
    enabled: Boolean(client && hasCalendarView),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, calendarViewId, "calendar", rpcContext),
        );
      } catch {
        return null;
      }
    },
  });

  const calendarSpec = useMemo(() => {
    const view = calendarViewQuery.data;
    if (!view) return null;
    return parseCalendarArch(view.arch);
  }, [calendarViewQuery.data]);

  const relationProjectionFields = useMemo<ViewField[]>(() => {
    const unique = new Map<string, ViewField>();
    for (const field of [
      ...Object.values(treeViewQuery.data?.fields ?? {}),
      ...Object.values(formViewQuery.data?.fields ?? {}),
      ...Object.values(calendarViewQuery.data?.fields ?? {}),
    ]) {
      if (!unique.has(field.name)) unique.set(field.name, field);
    }
    return [...unique.values()];
  }, [treeViewQuery.data, formViewQuery.data, calendarViewQuery.data]);

  const listFields = useMemo(() => {
    const cols = treeViewQuery.data ? treeColumns(treeViewQuery.data).map((c) => c.name) : [];
    const hierarchy = treeViewQuery.data ? treeMeta(treeViewQuery.data, props.model) : null;
    const knownFields = new Set([
      "id",
      "rec_name",
      ...Object.keys(treeViewQuery.data?.fields ?? {}),
      ...Object.keys(formViewQuery.data?.fields ?? {}),
      ...Object.keys(calendarViewQuery.data?.fields ?? {}),
    ]);
    const merged = [
      ...new Set([
        "id",
        ...cols,
        ...DEFAULT_FIELDS,
        "start",
        "end",
        "date",
        "appointment_date",
        "create_date",
        "dtstart",
        "dtend",
        ...(calendarSpec?.dtstart ? [calendarSpec.dtstart] : []),
        ...(calendarSpec?.dtend ? [calendarSpec.dtend] : []),
        ...(calendarSpec?.color ? [calendarSpec.color] : []),
        ...(calendarSpec?.titleField ? [calendarSpec.titleField] : []),
        ...(hierarchy?.parentField ? [hierarchy.parentField] : []),
        ...(hierarchy?.sequenceField ? [hierarchy.sequenceField] : []),
        ...(hierarchy?.childField ? [hierarchy.childField] : []),
      ]),
    ];
    const baseFields = merged.filter((field) => knownFields.has(field)).slice(0, 28);
    return [
      ...new Set([...withMany2OneRecNames(baseFields, relationProjectionFields), "_timestamp"]),
    ];
  }, [
    treeViewQuery.data,
    formViewQuery.data,
    calendarViewQuery.data,
    props.model,
    calendarSpec,
    relationProjectionFields,
  ]);
  const listFormViewQuery = useQuery({
    queryKey: ["model", props.model, "list-form-view", listFormViewId, rpcScope],
    enabled: Boolean(client && viewMode === "list-form"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, listFormViewId, "list-form", rpcContext),
        );
      } catch {
        return treeViewQuery.data;
      }
    },
  });

  const graphViewQuery = useQuery({
    queryKey: ["model", props.model, "graph-view", graphViewId, rpcScope],
    enabled: Boolean(client && viewMode === "graph"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, graphViewId, "graph", rpcContext),
        );
      } catch {
        return null;
      }
    },
  });

  const hierarchyMeta = useMemo(
    () => (treeViewQuery.data ? treeMeta(treeViewQuery.data, props.model) : null),
    [treeViewQuery.data, props.model],
  );

  const resolvedActionDomain = useMemo(
    () => evalDomain(props.actionDomain ?? [], { ...sessionContext, ...actionCtxOverlay }),
    [props.actionDomain, sessionContext, actionCtxOverlay],
  );

  const domainTabs = props.actionDomains ?? [];
  const activeTabDomain = useMemo(
    () =>
      activeWorkspaceTabDomain(domainTabs, domainTab, {
        ...sessionContext,
        ...actionCtxOverlay,
      }),
    [domainTabs, domainTab, sessionContext, actionCtxOverlay],
  );

  const searchFields = useMemo(() => {
    if (!treeViewQuery.data) return ["rec_name", "name", "code"];
    const cols = treeColumns(treeViewQuery.data);
    const knownFields = new Set([
      "rec_name",
      ...Object.keys(treeViewQuery.data.fields),
      ...Object.keys(formViewQuery.data?.fields ?? {}),
    ]);
    const names = cols
      .filter((c) => !c.type || c.type === "char" || c.type === "text" || c.type === "many2one")
      .map((c) => c.name)
      .slice(0, 8);
    return [...new Set(["rec_name", "name", "code", ...names])].filter((field) =>
      knownFields.has(field),
    );
  }, [treeViewQuery.data, formViewQuery.data]);

  const filterFields = useMemo<ViewField[]>(() => {
    const candidates: ViewField[] = [
      { name: "id", string: "ID", type: "integer" },
      { name: "rec_name", string: "Record name", type: "char" },
      ...Object.values(treeViewQuery.data?.fields ?? {}),
      ...Object.values(formViewQuery.data?.fields ?? {}),
    ];
    const unique = new Map<string, ViewField>();
    for (const field of candidates) {
      if (!unique.has(field.name)) unique.set(field.name, field);
    }
    return [...unique.values()];
  }, [treeViewQuery.data, formViewQuery.data]);

  const searchInputResult = useMemo(
    () => parseSearchDomain(searchInput, searchFields),
    [searchInput, searchFields],
  );

  const listDomainResult = useMemo(
    () =>
      workspaceListDomainResult(resolvedActionDomain, activeTabDomain, searchQuery, searchFields),
    [resolvedActionDomain, activeTabDomain, searchQuery, searchFields],
  );
  const listDomain = listDomainResult.ok
    ? listDomainResult.domain
    : mergeDomains(resolvedActionDomain, activeTabDomain);

  const order = useMemo(() => formatOrder(sorts), [sorts]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: model/action changes define a new volatile workspace projection.
  useEffect(() => {
    setOffset(0);
    setExpandedTreeIds(new Set());
    setLazyTreeRows([]);
    setEmptyTreeParents(new Set());
    setDomainTab(-1);
    setHiddenOptionalCols({});
    setViewMode(initialWorkspaceViewMode(props.actionViews));
  }, [props.model, props.actionDomains, props.actionViews]);
  const listQuery = useQuery({
    queryKey: [
      "model",
      props.model,
      "list",
      listFields.join(","),
      JSON.stringify(listDomain),
      offset,
      pageSize,
      order ?? "",
      rpcScope,
    ],
    enabled: Boolean(client && treeViewQuery.isSuccess && listDomainResult.ok),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!client) return [];
      return client.searchRead(
        props.model,
        listDomain as never[],
        listFields,
        offset,
        pageSize,
        order,
        rpcContext,
      );
    },
  });

  const projectedListRows = useMemo(
    () =>
      hydrateMany2OneRows(
        (listQuery.data ?? []) as Array<Record<string, unknown>>,
        relationProjectionFields,
      ),
    [listQuery.data, relationProjectionFields],
  );

  const flatTree = useMemo(() => {
    const rows = hydrateMany2OneRows(
      mergeTreeRows(projectedListRows, lazyTreeRows),
      relationProjectionFields,
    );
    if (!hierarchyMeta?.hierarchical) {
      return rows.map((row) => ({
        row,
        depth: 0,
        hasChildren: false,
        expanded: false,
      }));
    }
    return flattenTreeRows(rows, hierarchyMeta, expandedTreeIds, {
      emptyParents: emptyTreeParents,
    }).map((item) => ({
      ...item,
      expanded: expandedTreeIds.has(Number(item.row.id)),
    }));
  }, [
    projectedListRows,
    lazyTreeRows,
    relationProjectionFields,
    hierarchyMeta,
    expandedTreeIds,
    emptyTreeParents,
  ]);

  function mutationContextForIds(context: JsonObject, ids: readonly number[]): JsonObject {
    const requested = new Set(ids);
    const visibleRows = mergeTreeRows(projectedListRows, lazyTreeRows).filter((row) =>
      requested.has(Number(row.id)),
    );
    const visibleTimestamps = trytonTimestampsForRecords(props.model, visibleRows);
    const currentScreen = screenRef.current;
    const screenTimestamps =
      currentScreen.model === props.model &&
      currentScreen.recordId != null &&
      requested.has(currentScreen.recordId)
        ? screenTrytonTimestamps(currentScreen)
        : {};
    return withTrytonTimestampContext(context, visibleTimestamps, screenTimestamps) as JsonObject;
  }

  useEffect(() => {
    if (!client || !session || !hierarchyMeta?.hierarchical || !listDomainResult.ok) return;
    let cancelled = false;
    void loadTreeState(client, props.model, session.userId, rpcContext, listDomain).then(
      (nodes) => {
        if (cancelled || !nodes.length) return;
        setExpandedTreeIds(new Set(nodes));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    client,
    session,
    hierarchyMeta?.hierarchical,
    props.model,
    rpcContext,
    listDomain,
    listDomainResult.ok,
  ]);

  useEffect(() => {
    if (!client || !session || !hierarchyMeta?.hierarchical || !listDomainResult.ok) return;
    if (treeStateTimer.current) clearTimeout(treeStateTimer.current);
    treeStateTimer.current = setTimeout(() => {
      void saveTreeState(
        client,
        props.model,
        session.userId,
        [...expandedTreeIds],
        rpcContext,
        listDomain,
      );
    }, 600);
    return () => {
      if (treeStateTimer.current) clearTimeout(treeStateTimer.current);
    };
  }, [
    client,
    session,
    hierarchyMeta?.hierarchical,
    props.model,
    expandedTreeIds,
    rpcContext,
    listDomain,
    listDomainResult.ok,
  ]);

  async function openEmail() {
    if (!selectedId) return;
    if (client && props.onOpenAction) {
      try {
        const actions = await getKeywords(
          client,
          "form_action",
          props.model,
          selectedId,
          rpcContext,
        );
        const hit = actions.find((a) => /mail|email|smtp/i.test(`${a.name} ${a.type} ${a.ref}`));
        if (hit) {
          props.onOpenAction(
            hit.ref,
            "email",
            buttonRpcContext(mutationContextForIds(rpcContext, [selectedId]), props.model, [
              selectedId,
            ]),
          );
          props.onHistory?.("email:keyword");
          return;
        }
      } catch {
        /* fall through to mailto */
      }
    }
    setEmailOpen(true);
  }

  async function reorderTreeRows(draggedId: number, targetId: number) {
    if (
      !client ||
      !modelAccess.write ||
      !hierarchyMeta?.parentField ||
      !hierarchyMeta.sequenceField
    )
      return;
    const all = mergeTreeRows(
      (listQuery.data ?? []) as Array<Record<string, unknown>>,
      lazyTreeRows,
    );
    const ordered = siblingReorderIds(all, hierarchyMeta.parentField, draggedId, targetId);
    if (!ordered?.length) {
      setNotice("Reorder only works among siblings");
      return;
    }
    const field = hierarchyMeta.sequenceField;
    setNotice("Reordering…");
    try {
      for (const { id, sequence } of sequenceWrites(ordered)) {
        await client.model(
          props.model,
          "write",
          [[id], { [field]: sequence }],
          mutationContextForIds(rpcContext, [id]),
        );
      }
      setNotice(`Reordered ${ordered.length} sibling(s)`);
      props.onHistory?.("tree:reorder");
      setLazyTreeRows([]);
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  async function fetchTreeChildren(parentId: number) {
    if (!client || !hierarchyMeta?.parentField) return;
    const already = mergeTreeRows(
      (listQuery.data ?? []) as Array<Record<string, unknown>>,
      lazyTreeRows,
    ).some((row) => {
      const raw = row[hierarchyMeta.parentField as string];
      const pid =
        typeof raw === "number"
          ? raw
          : Array.isArray(raw) && typeof raw[0] === "number"
            ? raw[0]
            : null;
      return pid === parentId;
    });
    if (already) return;
    try {
      const kids = (await client.searchRead(
        props.model,
        [[hierarchyMeta.parentField, "=", parentId]],
        listFields,
        0,
        200,
        hierarchyMeta.sequenceField ? `${hierarchyMeta.sequenceField} ASC` : null,
        rpcContext,
      )) as Array<Record<string, unknown>>;
      if (!kids.length) {
        setEmptyTreeParents((prev) => new Set(prev).add(parentId));
        return;
      }
      setLazyTreeRows((prev) => mergeTreeRows(prev, kids));
    } catch {
      /* soft-fail lazy expand */
    }
  }

  const countQuery = useQuery({
    queryKey: ["model", props.model, "count", JSON.stringify(listDomain), rpcScope],
    enabled: Boolean(client && treeViewQuery.isSuccess && listDomainResult.ok),
    staleTime: 30_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        const result = await client.model(
          props.model,
          "search_count",
          [listDomain as never[]],
          rpcContext,
        );
        return typeof result === "number" ? result : null;
      } catch {
        return null;
      }
    },
  });

  const domainCountQuery = useQuery({
    queryKey: [
      "model",
      props.model,
      "domain-tab-counts",
      JSON.stringify(resolvedActionDomain),
      JSON.stringify(domainTabs),
      rpcScope,
    ],
    enabled: Boolean(client && domainTabs.some((tab) => tab.count)),
    staleTime: 30_000,
    queryFn: async () => {
      if (!client) return {} as Record<number, number>;
      const counts: Record<number, number> = {};
      await Promise.all(
        domainTabs.map(async (tab, index) => {
          if (!tab.count) return;
          const tabDomain = evalDomain(tab.domain ?? [], {
            ...sessionContext,
            ...actionCtxOverlay,
          });
          const domain = mergeDomains(resolvedActionDomain, tabDomain);
          try {
            const result = await client.model(
              props.model,
              "search_count",
              [domain as never[]],
              rpcContext,
            );
            if (typeof result === "number") counts[index] = result;
          } catch {
            /* optional Sao badge — ignore failures */
          }
        }),
      );
      return counts;
    },
  });

  const recordReadFields = useMemo(() => {
    const baseFields = [
      ...new Set([
        ...Object.keys(formViewQuery.data?.fields ?? { name: true }),
        "id",
        "_timestamp",
        "create_date",
        "write_date",
        "create_uid",
        "write_uid",
        "rec_name",
      ]),
    ];
    return withMany2OneRecNames(baseFields, Object.values(formViewQuery.data?.fields ?? {}));
  }, [formViewQuery.data]);

  const recordQuery = useQuery({
    queryKey: ["model", props.model, selectedId, "fields", recordReadFields.join(","), rpcScope],
    enabled: Boolean(client && selectedId && formViewQuery.isSuccess),
    queryFn: async (): Promise<{ recordId: number; values: RecordValues } | null> => {
      const requestedId = selectedId;
      if (!client || requestedId == null) return null;
      return readRecordSnapshot(
        client,
        props.model,
        requestedId,
        recordReadFields,
        formViewQuery.data?.fields ?? {},
        rpcContext,
      );
    },
  });

  useEffect(() => {
    const nextId = props.initialSelectedId ?? null;
    if (
      !externalSelectionNeedsSync(screenRef.current, selectedIdRef.current, props.model, nextId)
    ) {
      return;
    }
    bumpRecordScreenGeneration(recordLifecycleRefs, setOnChangePending);
    closeRelationEditor();
    setScreen((current) => screenForSelection(current, props.model, nextId));
    setSelectedId(nextId);
    setSelectedIds([]);
  }, [props.model, props.initialSelectedId, recordLifecycleRefs, closeRelationEditor]);

  useEffect(() => {
    const payload = recordQuery.data;
    if (!payload) return;
    setScreen((current) =>
      hydrateSelectedScreen(current, props.model, selectedId, payload.recordId, payload.values),
    );
  }, [recordQuery.data, props.model, selectedId]);

  const isDirty = mode === "write" && (screenIsDirty(screen) || hasOpenRelationDraft);
  dirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    return () => {
      bumpRecordScreenGeneration(recordLifecycleRefs);
    };
  }, [recordLifecycleRefs]);

  const aclRowsQuery = useQuery({
    queryKey: ["model", props.model, "acl-rows", rpcScope],
    enabled: Boolean(client),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) return null;
      return modelHasAccessRows(client, props.model);
    },
  });

  const modelAccessQuery = useQuery({
    queryKey: ["model", props.model, "access", session?.userId, rpcScope],
    enabled: Boolean(client && session),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      if (!client) throw new Error("No client");
      return getModelAccess(client, props.model, sessionContext);
    },
  });
  // Match Sao's safe fallback: reads may continue, but mutations fail closed.
  const modelAccess = modelAccessQuery.data ?? READ_ONLY_MODEL_ACCESS;

  function scheduleOnChange(name: string, nextDraft: RecordValues) {
    scheduleRecordOnChange({
      client,
      mode,
      model: props.model,
      fields: formViewQuery.data?.fields,
      context: rpcContext,
      refs: recordLifecycleRefs,
      name,
      nextDraft,
      setScreen,
      setPending: setOnChangePending,
      setNotice,
      onHistory: props.onHistory,
    });
  }

  async function flushPendingOnChange() {
    await flushRecordOnChange(recordLifecycleRefs);
  }

  function handleFieldChange(name: string, value: unknown) {
    applyRecordFieldChange({
      client,
      mode,
      model: props.model,
      fields: formViewQuery.data?.fields,
      context: rpcContext,
      refs: recordLifecycleRefs,
      name,
      value,
      setScreen,
      setPending: setOnChangePending,
      setNotice,
      onHistory: props.onHistory,
    });
  }

  async function startNew() {
    if (!modelAccess.create) return;
    if (!confirmDiscard()) return;
    closeRelationEditor();
    bumpScreenGeneration();
    const expected = {
      generation: screenGenerationRef.current,
      model: props.model,
      recordId: null as number | null,
    };
    setSelectedId(null);
    props.onSelectedIdChange?.(null);
    setMode("write");
    const emptyScreen = createScreen(props.model, null);
    screenRef.current = emptyScreen;
    setScreen(emptyScreen);
    props.onHistory?.("new");
    if (!client) return;
    setNewDefaultsGeneration(expected.generation);
    try {
      const formView = formViewQuery.data ?? (await formViewQuery.refetch()).data;
      if (!formView) throw new Error(t("workspace.defaultsFailed"));
      const fieldNames = Object.keys(formView.fields);
      const defaults = await client.model(props.model, "default_get", [fieldNames], rpcContext);
      const backendDefaults =
        defaults && typeof defaults === "object" && !Array.isArray(defaults)
          ? (defaults as RecordValues)
          : {};
      const defaultsForScreen = await hydrateDefaultMany2OneNames(
        {
          ...backendDefaults,
          ...actionDomainDefaults(resolvedActionDomain, fieldNames),
        },
        Object.values(formView.fields),
        async (relation, id) => {
          const result = await client.model(relation, "read", [[id], ["rec_name"]], rpcContext);
          const record = Array.isArray(result) ? result[0] : null;
          if (!record || typeof record !== "object" || Array.isArray(record)) return null;
          const recName = (record as Record<string, unknown>).rec_name;
          return typeof recName === "string" && recName.length > 0 ? recName : null;
        },
      );
      setScreen((current) =>
        screenAfterNewDefaults(expected, screenGenerationRef.current, current, defaultsForScreen),
      );
    } catch (error) {
      setScreen((current) =>
        screenAfterNewDefaults(expected, screenGenerationRef.current, current),
      );
      setNotice(
        error instanceof Error
          ? `${t("workspace.defaultsFailed")}: ${error.message}`
          : t("workspace.defaultsFailed"),
      );
    } finally {
      setNewDefaultsGeneration((current) => (current === expected.generation ? null : current));
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      if (openRelationDraftRef.current) {
        throw new Error(t("relationLine.finishNested"));
      }
      if (selectedId == null ? !modelAccess.create : !modelAccess.write) {
        throw new Error(t("workspace.accessDenied"));
      }
      return saveRecord({
        client,
        model: props.model,
        selectedId,
        fieldMeta: formViewQuery.data?.fields ?? {},
        context: rpcContext,
        getGeneration: () => screenGenerationRef.current,
        getScreen: () => screenRef.current,
        flushPendingOnChange,
        bumpScreenGeneration,
        onHistory: props.onHistory,
      });
    },
    onSuccess: async ({ id, savedValues }) => {
      selectId(id, true);
      leaveWriteMode();
      dirtyRef.current = false;
      const savedScreen = createScreen(props.model, id, savedValues);
      screenRef.current = savedScreen;
      setScreen(savedScreen);
      const expected = {
        generation: screenGenerationRef.current,
        model: props.model,
        recordId: id,
      };
      let committedSnapshot = null;
      if (client) {
        try {
          committedSnapshot = await readRecordSnapshot(
            client,
            props.model,
            id,
            recordReadFields,
            formViewQuery.data?.fields ?? {},
            rpcContext,
          );
        } catch {
          // The write is already committed. Keep it distinct from a failed save
          // and fail closed until the normal record query can reload its epoch.
        }
      }
      const stillCurrent = () => {
        const current = screenRef.current;
        return (
          screenGenerationRef.current === expected.generation &&
          current.model === expected.model &&
          current.recordId === expected.recordId
        );
      };
      if (stillCurrent()) {
        const refreshedScreen = committedSnapshot
          ? createScreen(props.model, id, committedSnapshot.values)
          : createScreen(props.model, id);
        screenRef.current = refreshedScreen;
        setScreen(refreshedScreen);
        setNotice(committedSnapshot ? t("workspace.saved") : t("workspace.savedRefreshFailed"));
      }
      try {
        await invalidateModelProjections(queryClient);
      } catch {
        // Invalidating projections is best effort after a committed write; the
        // explicit read above already refreshed (or failed closed) this Screen.
      }
    },
  });

  const canModifyCurrent = selectedId == null ? modelAccess.create : modelAccess.write;
  const canSave =
    canModifyCurrent &&
    !newDefaultsPending &&
    !hasOpenRelationDraft &&
    !openRelationDraftRef.current &&
    isScreenReadyToSave(screen, selectedId);

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!client || !ids.length) throw new Error(t("workspace.nothingSelected"));
      if (!modelAccess.delete) throw new Error(t("workspace.accessDenied"));
      const mutationContext = mutationContextForIds(rpcContext, ids);
      // Deleting abandons the edited lifecycle; no late field patch may revive it.
      bumpScreenGeneration();
      await client.model(props.model, "delete", [ids], mutationContext);
      props.onHistory?.("delete");
    },
    onSuccess: async () => {
      selectId(null, true);
      setMultiSelect([]);
      setScreen(createScreen(props.model, null));
      setPendingDeleteIds(null);
      setNotice(t("workspace.deleted"));
      await invalidateModelProjections(queryClient);
    },
    onError: (err) => {
      setPendingDeleteIds(null);
      setNotice(err instanceof Error ? err.message : t("workspace.deleteFailed"));
    },
  });

  function requestDelete(ids: number[]) {
    if (!modelAccess.delete) return;
    if (!ids.length) {
      setNotice(t("workspace.nothingSelected"));
      return;
    }
    if (!confirmDiscard()) return;
    setPendingDeleteIds(ids);
  }

  function selectAdjacent(delta: -1 | 1) {
    const next = adjacentSelectedId(projectedListRows, selectedId, delta);
    if (next == null) return;
    if (!selectId(next)) return;
    leaveWriteMode();
    props.onHistory?.("nav");
  }

  keyHandlersRef.current = { startNew, requestDelete, confirmDiscard, selectAdjacent };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (
          mode === "write" &&
          (selectedId == null ? modelAccess.create : modelAccess.write) &&
          !newDefaultsPending &&
          !openRelationDraftRef.current &&
          !saveMutation.isPending &&
          isScreenReadyToSave(screenRef.current, selectedId)
        ) {
          saveMutation.mutate();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !typing) {
        e.preventDefault();
        if (modelAccess.create) void keyHandlersRef.current.startNew();
        return;
      }
      if (e.key === "F5" && !typing) {
        e.preventDefault();
        if (!listDomainResult.ok) {
          setNotice(listDomainResult.error);
          return;
        }
        void listQuery.refetch();
        return;
      }
      if (
        e.key === "Delete" &&
        !typing &&
        modelAccess.delete &&
        (selectedId || selectedIds.length)
      ) {
        const ids = effectiveSelectedIds(selectedIds, selectedId);
        e.preventDefault();
        keyHandlersRef.current.requestDelete(ids);
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !typing) {
        e.preventDefault();
        keyHandlersRef.current.selectAdjacent(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Escape" && mode === "write" && !typing) {
        if (!keyHandlersRef.current.confirmDiscard()) return;
        bumpRecordScreenGeneration(recordLifecycleRefs, setOnChangePending);
        const restored = screenAfterDiscard(props.model, selectedId, recordQuery.data?.values);
        if (restored) setScreen(restored);
        closeRelationEditor();
        setMode("read");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    mode,
    saveMutation,
    selectedId,
    selectedIds,
    listQuery,
    listDomainResult,
    recordQuery.data,
    props.model,
    recordLifecycleRefs,
    newDefaultsPending,
    modelAccess.create,
    modelAccess.write,
    modelAccess.delete,
    closeRelationEditor,
  ]);

  async function runButton(name: string, meta?: { type?: string }) {
    if (!client || !selectedId) {
      setNotice(t("workspace.selectBeforeButton"));
      return;
    }
    const ids = effectiveSelectedIds(selectedIds, selectedId);
    const activeIds = ids as [number, ...number[]];
    if (isActionButton(name, meta?.type) && props.onOpenAction) {
      setNotice(t("workspace.openingAction", { name }));
      props.onOpenAction(
        name,
        `button:${name}`,
        buttonRpcContext(mutationContextForIds(rpcContext, ids), props.model, activeIds),
      );
      props.onHistory?.(`button:action:${name}`);
      return;
    }
    const flightKey = `${props.model}:${name}:${ids.join(",")}`;
    if (!beginButtonFlight(buttonFlightRef, flightKey)) return;
    setButtonFlight(flightKey);
    setNotice(t("workspace.runningButton", { name }));
    try {
      await client.model(
        props.model,
        name,
        [ids],
        buttonRpcContext(mutationContextForIds(rpcContext, ids), props.model, activeIds),
      );
      props.onHistory?.(`button:${name}`);
      setNotice(t("workspace.buttonOk", { name, count: ids.length }));
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("workspace.buttonFailed"));
    } finally {
      if (finishButtonFlight(buttonFlightRef, flightKey)) setButtonFlight(null);
    }
  }

  const treeIsEditable = useMemo(
    () =>
      modelAccess.write &&
      (forceTreeEdit || (treeViewQuery.data ? treeEditable(treeViewQuery.data) : false)),
    [forceTreeEdit, treeViewQuery.data, modelAccess.write],
  );

  const treeRowActions = useMemo(
    () => (treeViewQuery.data ? treeButtons(treeViewQuery.data) : []),
    [treeViewQuery.data],
  );

  const treeAddPlacement = useMemo(
    () => (treeViewQuery.data ? treeEditablePlacement(treeViewQuery.data) : null),
    [treeViewQuery.data],
  );

  const columns = useMemo(() => {
    const source =
      viewMode === "list-form" && listFormViewQuery.data
        ? listFormViewQuery.data
        : treeViewQuery.data;
    if (!source) {
      return [
        { name: "id", string: "ID" },
        { name: "rec_name", string: "Name" },
      ];
    }
    return treeColumns(source).map((c) => {
      const meta = source.fields[c.name];
      return {
        ...c,
        relation: meta?.relation,
      };
    });
  }, [viewMode, listFormViewQuery.data, treeViewQuery.data]);

  const displayColumns = useMemo(
    () => columns.filter((c) => !("optional" in c && c.optional && hiddenOptionalCols[c.name])),
    [columns, hiddenOptionalCols],
  );

  const optionalColumns = useMemo(
    () => columns.filter((c) => "optional" in c && Boolean(c.optional)),
    [columns],
  );

  async function commitTreeCell(id: number, field: string, value: unknown) {
    if (!client || !modelAccess.write) return;
    try {
      setNotice(`Writing ${field}…`);
      await client.model(
        props.model,
        "write",
        [[id], { [field]: value } as JsonObject],
        mutationContextForIds(rpcContext, [id]),
      );
      setNotice(`Updated #${id}.${field}`);
      props.onHistory?.(`tree:write:${field}`);
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Tree write failed");
    }
  }

  async function runTreeButton(
    id: number,
    action: { name: string; type?: string; confirm?: string },
  ) {
    if (!client) return;
    if (!selectId(id)) return;
    if (isActionButton(action.name, action.type) && props.onOpenAction) {
      props.onOpenAction(
        action.name,
        `tree-button:${action.name}`,
        buttonRpcContext(mutationContextForIds(rpcContext, [id]), props.model, [id]),
      );
      props.onHistory?.(`tree-button:action:${action.name}`);
      return;
    }
    const flightKey = `${props.model}:${action.name}:${id}`;
    if (!beginButtonFlight(buttonFlightRef, flightKey)) return;
    setButtonFlight(flightKey);
    setNotice(`Running ${action.name} on #${id}…`);
    try {
      const ids: [number] = [id];
      await client.model(
        props.model,
        action.name,
        [ids],
        buttonRpcContext(mutationContextForIds(rpcContext, ids), props.model, ids),
      );
      props.onHistory?.(`tree-button:${action.name}`);
      setNotice(`Button ${action.name} OK`);
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Tree button failed");
    } finally {
      if (finishButtonFlight(buttonFlightRef, flightKey)) setButtonFlight(null);
    }
  }

  async function addTreeRow() {
    if (!client || !modelAccess.create) return;
    setNotice("Creating row…");
    try {
      const fieldNames = columns.map((c) => c.name).filter((n) => n !== "id");
      const defaults = (await client.model(
        props.model,
        "default_get",
        [fieldNames.length ? fieldNames : ["name", "rec_name"]],
        rpcContext,
      )) as JsonObject;
      const created = await client.model(props.model, "create", [[defaults]], rpcContext);
      const id = Array.isArray(created) ? Number(created[0]) : Number(created);
      setNotice(Number.isFinite(id) ? `Created #${id}` : "Created");
      props.onHistory?.("tree:create");
      if (Number.isFinite(id)) selectId(id);
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Create row failed");
    }
  }

  const calendarEvents = useMemo(
    () =>
      rowsToCalendarEvents(projectedListRows, {
        startField: calendarSpec?.dtstart,
        endField: calendarSpec?.dtend,
        titleField: calendarSpec?.titleField,
        colorField: calendarSpec?.color,
      }),
    [projectedListRows, calendarSpec],
  );

  async function createCalendarAt(startIso: string, endIso: string | null) {
    if (!client || !modelAccess.create) return;
    const startField = calendarSpec?.dtstart ?? "start";
    const endField = calendarSpec?.dtend;
    setNotice("Creating calendar event…");
    try {
      const defaults = (await client.model(
        props.model,
        "default_get",
        [[startField, ...(endField ? [endField] : []), "name", "rec_name"]],
        rpcContext,
      )) as JsonObject;
      const values: JsonObject = {
        ...defaults,
        [startField]: startIso.includes("T") ? startIso.replace("T", " ").slice(0, 19) : startIso,
      };
      if (endField && endIso) {
        values[endField] = endIso.includes("T") ? endIso.replace("T", " ").slice(0, 19) : endIso;
      }
      const created = await client.model(props.model, "create", [[values]], rpcContext);
      const id = Array.isArray(created) ? Number(created[0]) : Number(created);
      setNotice(Number.isFinite(id) ? `Created #${id}` : "Created");
      props.onHistory?.("calendar:create");
      if (Number.isFinite(id)) selectId(id);
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Calendar create failed");
    }
  }

  async function dropCalendarEvent(id: number, startIso: string, endIso: string | null) {
    if (!client || !modelAccess.write) return;
    const startField = calendarSpec?.dtstart ?? "start";
    const endField = calendarSpec?.dtend;
    const values: JsonObject = {
      [startField]: startIso.includes("T") ? startIso.replace("T", " ").slice(0, 19) : startIso,
    };
    if (endField && endIso) {
      values[endField] = endIso.includes("T") ? endIso.replace("T", " ").slice(0, 19) : endIso;
    }
    try {
      await client.model(
        props.model,
        "write",
        [[id], values],
        mutationContextForIds(rpcContext, [id]),
      );
      props.onHistory?.("calendar:drop");
      setNotice(`Moved #${id}`);
      await invalidateModelProjections(queryClient);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Calendar move failed");
    }
  }

  const graphSpec = useMemo(() => {
    if (graphViewQuery.data) return parseGraphArch(graphViewQuery.data.arch);
    return null;
  }, [graphViewQuery.data]);

  const graphFields = useMemo(() => {
    if (graphSpec) {
      return {
        xField: graphSpec.xFields[0] ?? "rec_name",
        yField: graphSpec.yFields[0] ?? "id",
        yFields: graphSpec.yFields,
        yOperator: graphSpec.yOperators[0] ?? "sum",
        chartType: graphSpec.type,
        title: graphSpec.string,
      };
    }
    const names = columns.map((c) => c.name);
    const inferred = inferGraphFields(names);
    return {
      xField: inferred.xField,
      yField: inferred.yField,
      yFields: [inferred.yField],
      yOperator: "sum" as const,
      chartType: "vbar" as const,
      title: undefined as string | undefined,
    };
  }, [columns, graphSpec]);

  const graphData = useMemo(
    () =>
      aggregateGraphData(
        projectedListRows,
        graphFields.xField,
        graphFields.yField,
        graphFields.yOperator,
      ),
    [projectedListRows, graphFields],
  );

  const graphMulti = useMemo(() => {
    if (graphFields.yFields.length <= 1) return undefined;
    return rowsToMultiSeries(projectedListRows, graphFields.xField, graphFields.yFields);
  }, [projectedListRows, graphFields]);

  const graphInsight = useMemo(() => summarizeSeries(graphData), [graphData]);

  const aclWarning = strictAclCoach(props.model, aclRowsQuery.data ?? null);
  const listState = !listDomainResult.ok
    ? "error"
    : listQuery.isLoading
      ? "loading"
      : listQuery.isError
        ? "error"
        : listQuery.data?.length
          ? "data"
          : "empty";

  const total = countQuery.data;
  const canPrev = offset > 0;
  const canNext =
    total != null ? offset + pageSize < total : (listQuery.data?.length ?? 0) >= pageSize;
  const activeRelationQueue =
    relationField?.type === "one2many" || relationField?.type === "many2many"
      ? screen.relationQueues[relationField.name]
      : undefined;

  function selectDomainTab(index: number) {
    setDomainTab(index);
    setOffset(0);
  }

  function applySearch() {
    const result = parseSearchDomain(searchInput, searchFields);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setOffset(0);
    setSearchQuery(searchInput);
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setOffset(0);
  }

  function applySavedSearch(row: ViewSearchRow) {
    const text = savedSearchText(row.domain);
    setSearchInput(text);
    setSearchQuery(text);
    setOffset(0);
    setNotice(`Applied saved search “${row.name}”`);
  }

  async function saveCurrentSearch(name: string) {
    if (!client || !session) return;
    try {
      const parsed = parseSearchDomain(searchQuery, searchFields);
      if (!parsed.ok) throw new Error(parsed.error);
      await createViewSearch(
        client,
        {
          name,
          model: props.model,
          domain: (parsed.domain as JsonValue) ?? [],
          user: session.userId,
        },
        rpcContext,
      );
      await viewSearchesQuery.refetch();
      setNotice(`Saved search “${name}”`);
      setSavedSearchDialog(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save search");
    }
  }

  async function removeSavedSearch(id: number) {
    if (!client) return;
    try {
      await deleteViewSearch(client, id, rpcContext);
      await viewSearchesQuery.refetch();
      setNotice(`Deleted saved search #${id}`);
      setSavedSearchDialog(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Delete search failed");
    }
  }

  return (
    <div className="epiton-model-workspace">
      <ConfirmDialog
        open={pendingDeleteIds != null}
        title={t("workspace.deleteTitle", {
          count: pendingDeleteIds?.length ?? 0,
          model: props.model,
        })}
        description={t("workspace.deleteDescription")}
        confirmLabel={t("workspace.delete")}
        cancelLabel={t("workspace.cancel")}
        danger
        onCancel={() => setPendingDeleteIds(null)}
        onConfirm={() => {
          if (pendingDeleteIds?.length) deleteMutation.mutate(pendingDeleteIds);
        }}
      />
      <CsvImportDialog
        open={csvImportText != null}
        csvText={csvImportText ?? ""}
        fieldNames={
          Object.keys(formViewQuery.data?.fields ?? {}).length
            ? Object.keys(formViewQuery.data?.fields ?? {})
            : columns.map((c) => c.name).filter(Boolean)
        }
        onCancel={() => setCsvImportText(null)}
        onConfirm={(mapping) => void confirmCsvImport(mapping)}
      />
      <EmailComposeDialog
        open={emailOpen}
        model={props.model}
        recordId={selectedId}
        values={draft}
        onCancel={() => setEmailOpen(false)}
      />
      <CsvExportDialog
        open={csvExportOpen}
        fieldNames={
          Object.keys(formViewQuery.data?.fields ?? {}).length
            ? ["id", "rec_name", ...Object.keys(formViewQuery.data?.fields ?? {})]
            : ["id", "rec_name", ...columns.map((c) => c.name).filter(Boolean)]
        }
        initialSelected={columns.map((c) => c.name).filter(Boolean)}
        onCancel={() => setCsvExportOpen(false)}
        onConfirm={(fields) => {
          setCsvExportOpen(false);
          void exportCsv(fields);
        }}
      />
      <Panel title={props.model}>
        <WorkspaceDomainTabs
          tabs={domainTabs}
          activeIndex={domainTab}
          counts={domainCountQuery.data}
          onSelect={selectDomainTab}
        />
        <WorkspaceListActionToolbar
          clientAvailable={Boolean(client) && !saveMutation.isPending}
          canCreate={modelAccess.create}
          canWrite={modelAccess.write}
          canDelete={modelAccess.delete}
          hasFocusedRecord={Boolean(selectedId)}
          multiSelectedCount={selectedIds.length}
          visibleRowCount={listQuery.data?.length ?? 0}
          inlineEditActive={forceTreeEdit && modelAccess.write}
          treeEditable={treeIsEditable}
          onNew={() => void startNew()}
          onRefresh={() => {
            if (!listDomainResult.ok) {
              setNotice(listDomainResult.error);
              return;
            }
            void listQuery.refetch();
          }}
          onSelectView={setViewMode}
          onToggleInlineEdit={() => {
            if (modelAccess.write) setForceTreeEdit((value) => !value);
          }}
          onDelete={() => requestDelete(effectiveSelectedIds(selectedIds, selectedId))}
          onCopy={() => void copySelected()}
          onExportCsv={() => setCsvExportOpen(true)}
          onImportCsv={(file) => void importCsvFile(file)}
        />
        <WorkspaceSearchControls
          searchInput={searchInput}
          fields={filterFields}
          searchError={searchInputResult.ok ? null : searchInputResult.error}
          savedSearches={viewSearchesQuery.data}
          savedSearchDialog={savedSearchDialog}
          canSaveSearch={Boolean(client && session && searchQuery.trim() && listDomainResult.ok)}
          onSearchInputChange={setSearchInput}
          onApplySearch={applySearch}
          onClearSearch={clearSearch}
          onApplySavedSearch={applySavedSearch}
          onOpenSavedSearchDialog={setSavedSearchDialog}
          onCancelSavedSearchDialog={() => setSavedSearchDialog(null)}
          onSaveSearch={(name) => void saveCurrentSearch(name)}
          onDeleteSearch={(id) => void removeSavedSearch(id)}
        />
        <div className="epiton-toolbar">
          <Button disabled={!canPrev} onClick={() => setOffset((o) => Math.max(0, o - pageSize))}>
            Prev
          </Button>
          <span className="text-sm text-[var(--epiton-muted)]" role="status">
            {offset + 1}–{offset + (listQuery.data?.length ?? 0)}
            {total != null ? ` / ${total}` : ""}
            {order ? ` · ${order}` : ""}
          </span>
          <Button disabled={!canNext} onClick={() => setOffset((o) => o + pageSize)}>
            Next
          </Button>
          <label className="text-sm text-[var(--epiton-muted)]">
            Limit{" "}
            <select
              value={pageSize}
              aria-label="Page size"
              onChange={(e) => {
                setOffset(0);
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {optionalColumns.length && viewMode === "tree" ? (
          <details className="epiton-tree-columns">
            <summary>{t("workspace.columns")}</summary>
            <div className="epiton-toolbar">
              {optionalColumns.map((c) => (
                <label key={c.name} className="text-sm">
                  <input
                    type="checkbox"
                    checked={!hiddenOptionalCols[c.name]}
                    onChange={(e) => {
                      setHiddenOptionalCols((prev) => {
                        const next = { ...prev };
                        if (e.target.checked) delete next[c.name];
                        else next[c.name] = true;
                        return next;
                      });
                    }}
                  />{" "}
                  {c.string}
                </label>
              ))}
            </div>
          </details>
        ) : null}
        <StateBlock
          state={listState}
          message={
            !listDomainResult.ok
              ? listDomainResult.error
              : listQuery.isError
                ? listQuery.error.message
                : t("workspace.noRecords")
          }
        >
          {viewMode === "calendar" ? (
            <CalendarView
              events={calendarEvents}
              editable={modelAccess.write}
              onSelect={(id) => {
                if (!selectId(id)) return;
                leaveWriteMode();
                props.onHistory?.("open");
              }}
              onCreateAt={
                modelAccess.create ? (start, end) => void createCalendarAt(start, end) : undefined
              }
              onEventDrop={
                modelAccess.write
                  ? (id, start, end) => void dropCalendarEvent(id, start, end)
                  : undefined
              }
            />
          ) : viewMode === "graph" ? (
            <GraphView
              data={graphData}
              multi={graphMulti}
              yKeys={graphFields.yFields.length > 1 ? graphFields.yFields : undefined}
              chartType={graphFields.chartType}
              yLabel={graphFields.yField}
              title={graphFields.title}
              insight={graphInsight}
              onSelectPoint={(label) => {
                const hit = projectedListRows.find((row) => {
                  const name = String(row.rec_name ?? row.name ?? row.code ?? row.id ?? "");
                  return name === label || String(row.id) === label;
                });
                if (!hit) return;
                const id = Number(hit.id);
                if (!Number.isFinite(id)) return;
                if (!selectId(id)) return;
                void openKeywordAction("graph_open", id, "graph_open").then((opened) => {
                  if (!opened) props.onHistory?.("graph:select");
                });
              }}
            />
          ) : viewMode === "list-form" ? (
            <ListFormView
              rows={projectedListRows}
              view={listFormViewQuery.data}
              columns={displayColumns}
              density={density}
              selectedId={selectedId}
              onSelect={(id) => {
                if (!selectId(id)) return;
                leaveWriteMode();
                props.onHistory?.("open");
              }}
            />
          ) : (
            <VirtualPartyTable
              rows={flatTree.map((item) => item.row)}
              rowMeta={
                hierarchyMeta?.hierarchical
                  ? flatTree.map((item) => ({
                      depth: item.depth,
                      hasChildren: item.hasChildren,
                      expanded: item.expanded,
                    }))
                  : undefined
              }
              columns={displayColumns}
              selectedId={selectedId}
              selectedIds={selectedIds}
              editable={treeIsEditable}
              rowActions={treeRowActions}
              rowActionsPending={buttonFlight !== null}
              addRowPlacement={treeIsEditable ? treeAddPlacement : null}
              onAddRow={treeIsEditable ? () => void addTreeRow() : undefined}
              onCellCommit={(id, field, value) => void commitTreeCell(id, field, value)}
              onEditRelation={(id, field) => {
                if (!field.relation) return;
                setTreeM2O({
                  id,
                  field: {
                    name: field.name,
                    type: "many2one",
                    string: field.string,
                    relation: field.relation,
                  },
                });
              }}
              onRowAction={(id, action) => void runTreeButton(id, action)}
              onToggleExpand={(id) => {
                setExpandedTreeIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else {
                    next.add(id);
                    void fetchTreeChildren(id);
                  }
                  return next;
                });
              }}
              onReorder={
                hierarchyMeta?.sequenceField
                  ? (from, to) => void reorderTreeRows(from, to)
                  : undefined
              }
              onOpen={(id) => {
                if (!selectId(id)) return;
                leaveWriteMode();
                void openKeywordAction("tree_open", id, "tree_open").then((opened) => {
                  if (!opened) props.onHistory?.("open");
                });
              }}
              onSortChange={(next) => {
                setOffset(0);
                setSorts(next);
              }}
              onToggleSelect={(id) => {
                setMultiSelect(toggleSelectedId(selectedIds, id));
              }}
              onSelect={(id) => {
                if (!selectId(id)) return;
                leaveWriteMode();
                props.onHistory?.("open");
              }}
            />
          )}
        </StateBlock>
        {calendarSpec ? (
          <p className="text-sm text-[var(--epiton-muted)]" role="status">
            Calendar · {calendarSpec.dtstart}
            {calendarSpec.dtend ? ` → ${calendarSpec.dtend}` : ""}
            {calendarSpec.color ? ` · color ${calendarSpec.color}` : ""}
          </p>
        ) : calendarViewQuery.data ? (
          <p className="text-sm text-[var(--epiton-muted)]" role="status">
            Calendar arch loaded (using default date fields)
          </p>
        ) : null}
      </Panel>

      <Panel
        title={
          selectedId
            ? `${props.model} #${selectedId}${isDirty ? " *" : ""}`
            : `${props.model} form${isDirty ? " *" : ""}`
        }
      >
        {aclWarning ? <Alert tone="muted">{aclWarning.message}</Alert> : null}
        {modelAccessQuery.isError ? (
          <Alert tone="danger">{t("workspace.accessUnavailable")}</Alert>
        ) : null}
        {formViewQuery.isError ? (
          <Alert tone="danger">
            Form view failed:{" "}
            {formViewQuery.error instanceof Error ? formViewQuery.error.message : "unknown"}
          </Alert>
        ) : null}
        {treeViewQuery.isError ? (
          <Alert tone="danger">
            Tree view failed:{" "}
            {treeViewQuery.error instanceof Error ? treeViewQuery.error.message : "unknown"}
          </Alert>
        ) : null}
        {notice ? <Alert tone={noticeTone(notice)}>{notice}</Alert> : null}
        <WorkspaceRecordActionToolbar
          mode={mode}
          isDirty={isDirty}
          onChangePending={onChangePending || newDefaultsPending}
          clientAvailable={Boolean(client)}
          canCreate={modelAccess.create}
          canWrite={modelAccess.write}
          canDelete={modelAccess.delete}
          hasFocusedRecord={Boolean(selectedId)}
          canSave={canSave}
          savePending={saveMutation.isPending}
          onToggleMode={() => {
            if (!canModifyCurrent) return;
            if (mode === "write" && !confirmDiscard()) return;
            if (mode === "write") {
              closeRelationEditor();
              const restored = screenAfterDiscard(
                props.model,
                selectedId,
                recordQuery.data?.values,
              );
              if (restored) setScreen(restored);
              leaveWriteMode();
              return;
            }
            setMode("write");
          }}
          onSave={() => saveMutation.mutate()}
          onDelete={() => {
            if (selectedId) requestDelete([selectedId]);
          }}
          onCopy={() => void copySelected()}
          onToggleHistory={() => setShowHistory((value) => !value)}
          onEmail={() => void openEmail()}
        />
        <MetaStrip values={draft} />
        {showHistory && selectedId != null ? (
          <RecordHistoryPanel
            model={props.model}
            recordId={selectedId}
            fieldNames={
              formViewQuery.data
                ? Object.keys(formViewQuery.data.fields)
                : columns.map((c) => c.name)
            }
            currentValues={draft}
            onClose={() => setShowHistory(false)}
            onRestore={
              modelAccess.write
                ? (values) => {
                    const {
                      id: _id,
                      write_date: _wd,
                      write_uid: _wu,
                      create_date: _cd,
                      create_uid: _cu,
                      ...rest
                    } = values;
                    setScreen((current) =>
                      updateScreenValues(
                        { ...current, relationQueues: {} },
                        { ...current.values, ...rest },
                      ),
                    );
                    setMode("write");
                    setShowHistory(false);
                    setNotice(t("history.loadedDraft"));
                    props.onHistory?.("history:restore");
                  }
                : undefined
            }
          />
        ) : null}{" "}
        <WorkspaceKeywordActions
          model={props.model}
          recordId={selectedId}
          context={rpcContext}
          onOpen={props.onOpenAction}
        />
        {formViewQuery.data
          ? renderView(formViewQuery.data, {
              values: draft,
              mode: newDefaultsPending || !canModifyCurrent ? "read" : mode,
              density,
              model: props.model,
              onChange: handleFieldChange,
              onButton: (name, meta) => void runButton(name, meta),
              isButtonPending: () => buttonFlight !== null,
              onOpenRelation: (field, value, domain) => {
                if (
                  relationField &&
                  relationField.name !== field.name &&
                  openRelationDraftRef.current
                ) {
                  if (
                    typeof globalThis.confirm === "function" &&
                    !globalThis.confirm(t("relationLine.discardConfirm"))
                  ) {
                    return;
                  }
                  closeRelationEditor();
                }
                if (field.type === "one2many" || field.type === "many2many") {
                  const relationKind = field.type === "many2many" ? "many2many" : "one2many";
                  setScreen((current) => {
                    if (current.relationQueues[field.name]) return current;
                    return setScreenRelationQueue(
                      current,
                      field.name,
                      createRelationQueue(relationKind, current.values[field.name]),
                    );
                  });
                }
                setRelationField(field);
                setRelationDomain(domain);
                props.onHistory?.(`relation:${field.name}`);
                if (
                  field.type === "many2one" &&
                  field.relation &&
                  Array.isArray(value) &&
                  typeof value[0] === "number" &&
                  props.onPushRelated &&
                  mode === "read"
                ) {
                  props.onPushRelated(field.relation, value[0]);
                }
              },
              onBinaryDownload: (field, value) => {
                if (typeof value !== "string" || value.startsWith("javascript:")) return;
                try {
                  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
                  const fileName =
                    (field.filename && draft[field.filename] != null
                      ? String(draft[field.filename])
                      : "") || `${props.model}-${field.name}.bin`;
                  const mime = guessMime(fileName);
                  const blob = new Blob([bytes], { type: mime });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = fileName;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  setNotice("Binary download failed");
                }
              },
            })
          : recordQuery.isLoading
            ? "Loading…"
            : null}
        {treeM2O ? (
          <RelationSearch
            field={treeM2O.field}
            recordValues={{}}
            context={rpcContext}
            mode="write"
            onCancel={() => setTreeM2O(null)}
            onPick={(id, recName) => {
              void commitTreeCell(treeM2O.id, treeM2O.field.name, [id, recName]);
              setTreeM2O(null);
            }}
          />
        ) : null}
        {relationField?.type === "many2one" ? (
          <RelationSearch
            field={relationField}
            recordValues={draft}
            domain={relationDomain}
            context={rpcContext}
            mode={mode}
            onCancel={() => {
              setRelationField(null);
              setRelationDomain(undefined);
            }}
            onPick={(id, recName) => {
              const nextVal: [number, string] = [id, recName];
              const next = { ...screenRef.current.values, [relationField.name]: nextVal };
              replaceDraft(next);
              scheduleOnChange(relationField.name, next);
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : relationField && activeRelationQueue ? (
          <RelationLinesEditor
            key={`${props.model}:${relationField.name}`}
            field={relationField}
            value={draft[relationField.name]}
            mode={mode}
            recordValues={draft}
            domain={relationDomain}
            context={rpcContext}
            queue={activeRelationQueue}
            onQueueChange={(update: (current: RelationCommandQueue) => RelationCommandQueue) => {
              setScreen((current) => {
                const queue =
                  current.relationQueues[relationField.name] ??
                  createRelationQueue(activeRelationQueue.kind, current.values[relationField.name]);
                return setScreenRelationQueue(current, relationField.name, update(queue));
              });
            }}
            onOpenLine={(model, id) => props.onPushRelated?.(model, id)}
            onExitDecisionChange={handleRelationExitDecision}
            onCommit={() => {
              closeRelationEditor();
              setNotice(t("workspace.relationQueued"));
              props.onHistory?.(`relation:apply:${relationField.name}`);
            }}
          />
        ) : null}
        {saveMutation.isError ? <Alert tone="danger">{saveMutation.error.message}</Alert> : null}
      </Panel>
    </div>
  );
}
