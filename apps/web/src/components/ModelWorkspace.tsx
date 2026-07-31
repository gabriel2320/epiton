import { strictAclCoach } from "@epiton/intelligence";
import {
  type ActWindowDomainTab,
  type JsonObject,
  type JsonValue,
  applyFieldChange,
  copyRecords,
  createViewSearch,
  deleteViewSearch,
  exportModelCsv,
  getKeywords,
  importModelCsv,
  loadTreeState,
  loadViewSearches,
  modelHasAccessRows,
  saveTreeState,
  viewIdForMode,
} from "@epiton/protocol";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  MetaStrip,
  Panel,
  StateBlock,
  Tab,
  Tabs,
} from "@epiton/ui";
import {
  type RecordValues,
  type ViewField,
  aggregateGraphData,
  buildSearchDomain,
  evalContext,
  evalDomain,
  flattenTreeRows,
  formatOrder,
  inferGraphFields,
  mergeDomains,
  mergeTreeRows,
  parseCalendarArch,
  parseFieldsViewGet,
  parseGraphArch,
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
} from "@epiton/view-engine";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { guessMime } from "../lib/mime";
import {
  type RelationCommandQueue,
  type ScreenState,
  acceptAsyncScreenUpdate,
  createRelationQueue,
  createScreen,
  hydrateSelectedScreen,
  isScreenReadyToSave,
  screenForSelection,
  screenIsDirty,
  screenValuesForSave,
  setScreenRelationQueue,
  shouldApplyNewDefaults,
  updateScreenValues,
} from "../lib/screen";
import { useAppStore } from "../lib/store";
import { CalendarView } from "./CalendarView";
import { CsvExportDialog } from "./CsvExportDialog";
import { CsvImportDialog, applyCsvColumnMapping } from "./CsvImportDialog";
import { EmailComposeDialog } from "./EmailComposeDialog";
import { GraphView } from "./GraphView";
import { ListFormView } from "./ListFormView";
import { RecordActionsMenu } from "./RecordActionsMenu";
import { RecordHistoryPanel } from "./RecordHistoryPanel";
import { RelationLinesEditor } from "./RelationLinesEditor";
import { RelationSearch } from "./RelationSearch";
import { SavedSearchDialog } from "./SavedSearchDialog";
import { VirtualPartyTable } from "./VirtualPartyTable";

const DEFAULT_FIELDS = ["id", "rec_name", "name", "code", "active"];
const PAGE_SIZE_OPTIONS = [40, 80, 120, 200] as const;

function noticeTone(message: string): "default" | "accent" | "danger" | "muted" {
  if (/fail|error|before running|nothing selected/i.test(message)) return "danger";
  if (/…|\.\.\.|importing|exporting|copying|running/i.test(message)) return "muted";
  if (/saved|ok|exported|imported|copied/i.test(message)) return "accent";
  return "default";
}

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
  onOpenAction?: (ref: string, source: string) => void;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "list-form" | "calendar" | "graph">("tree");
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
  const [hiddenOptionalCols, setHiddenOptionalCols] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem(`epiton.tree.hidden.${props.model}`);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [treeM2O, setTreeM2O] = useState<{
    id: number;
    field: ViewField;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef(screen);
  const screenGenerationRef = useRef(0);
  const dirtyRef = useRef(false);
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

  function setDraft(next: RecordValues | ((current: RecordValues) => RecordValues)) {
    setScreen((current) =>
      updateScreenValues(current, typeof next === "function" ? next(current.values) : next),
    );
  }

  const actionCtxOverlay = useMemo(
    () => evalContext(props.actionContext ?? {}, sessionContext),
    [props.actionContext, sessionContext],
  );

  const rpcContext: JsonObject = useMemo(
    () => ({ ...sessionContext, ...actionCtxOverlay }) as JsonObject,
    [sessionContext, actionCtxOverlay],
  );

  const viewSearchesQuery = useQuery({
    queryKey: ["view-search", props.model, session?.userId],
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
  const listFormViewId = viewIdForMode(props.actionViews, "list-form");
  const graphViewId = viewIdForMode(props.actionViews, "graph");

  function bumpScreenGeneration() {
    screenGenerationRef.current += 1;
    if (onChangeTimer.current) {
      clearTimeout(onChangeTimer.current);
      onChangeTimer.current = null;
    }
  }

  function leaveWriteMode() {
    if (mode === "write") bumpScreenGeneration();
    setMode("read");
  }

  function confirmDiscard(): boolean {
    if (!dirtyRef.current) return true;
    if (typeof globalThis.confirm !== "function") return true;
    return globalThis.confirm(t("workspace.discardConfirm"));
  }

  function selectId(id: number | null, committed = false) {
    const changed = id !== selectedId;
    if (!committed && changed && !confirmDiscard()) return;
    if (!committed && changed) {
      bumpScreenGeneration();
      setScreen((current) => screenForSelection(current, props.model, id));
    }
    setSelectedId(id);
    props.onSelectedIdChange?.(id);
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
      props.onOpenAction(hit.ref, source);
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
    setNotice("Exporting CSV…");
    try {
      const fieldNames = fields?.length ? fields : columns.map((c) => c.name).filter(Boolean);
      const ids =
        selectedIds.length > 0 ? selectedIds : selectedId != null ? [selectedId] : undefined;
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
    if (!client) return;
    try {
      const text = await file.text();
      setCsvImportText(text);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to read CSV");
    }
  }

  async function confirmCsvImport(mapping: string[]) {
    if (!client || !csvImportText) return;
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
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function copySelected() {
    if (!client) return;
    const ids = selectedIds.length ? selectedIds : selectedId != null ? [selectedId] : [];
    if (!ids.length) return;
    setNotice("Copying…");
    try {
      const created = await copyRecords(client, props.model, ids, {}, rpcContext);
      setNotice(`Copied → ${created.join(", ") || "ok"}`);
      props.onHistory?.("copy");
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
      if (created[0] != null) {
        selectId(created[0]);
        setMode("write");
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Copy failed");
    }
  }

  const formViewQuery = useQuery({
    queryKey: ["model", props.model, "form-view", formViewId],
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
    queryKey: ["model", props.model, "tree-view", treeViewId],
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
    queryKey: ["model", props.model, "calendar-view", calendarViewId],
    enabled: Boolean(client),
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
    return merged.filter((field) => knownFields.has(field)).slice(0, 28);
  }, [treeViewQuery.data, formViewQuery.data, calendarViewQuery.data, props.model, calendarSpec]);
  const listFormViewQuery = useQuery({
    queryKey: ["model", props.model, "list-form-view", listFormViewId],
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
    queryKey: ["model", props.model, "graph-view", graphViewId],
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
  const activeTabDomain = useMemo(() => {
    if (domainTab < 0) return [];
    const tab = domainTabs[domainTab];
    if (!tab) return [];
    return evalDomain(tab.domain ?? [], { ...sessionContext, ...actionCtxOverlay });
  }, [domainTabs, domainTab, sessionContext, actionCtxOverlay]);

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

  const listDomain = useMemo(() => {
    const search = buildSearchDomain(searchQuery, searchFields);
    return mergeDomains(mergeDomains(resolvedActionDomain, activeTabDomain), search);
  }, [resolvedActionDomain, activeTabDomain, searchQuery, searchFields]);

  const order = useMemo(() => formatOrder(sorts), [sorts]);

  useEffect(() => {
    void props.model;
    void props.actionDomains;
    setOffset(0);
    setExpandedTreeIds(new Set());
    setLazyTreeRows([]);
    setEmptyTreeParents(new Set());
    const key = domainTabStorageKey(props.model, props.actionDomains);
    if (!key) {
      setDomainTab(-1);
      return;
    }
    try {
      const raw = sessionStorage.getItem(key);
      const n = raw == null ? -1 : Number(raw);
      setDomainTab(Number.isFinite(n) ? n : -1);
    } catch {
      setDomainTab(-1);
    }
  }, [props.model, props.actionDomains]);

  useEffect(() => {
    const key = domainTabStorageKey(props.model, props.actionDomains);
    if (!key) return;
    try {
      sessionStorage.setItem(key, String(domainTab));
    } catch {
      /* ignore */
    }
  }, [domainTab, props.model, props.actionDomains]);
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
    ],
    enabled: Boolean(client && treeViewQuery.isSuccess),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!client) return [];
      try {
        return await client.searchRead(
          props.model,
          listDomain as never[],
          listFields,
          offset,
          pageSize,
          order,
          rpcContext,
        );
      } catch {
        return await client.searchRead(
          props.model,
          [],
          ["id", "rec_name"],
          offset,
          pageSize,
          null,
          rpcContext,
        );
      }
    },
  });

  const flatTree = useMemo(() => {
    const rows = mergeTreeRows(
      (listQuery.data ?? []) as Array<Record<string, unknown>>,
      lazyTreeRows,
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
  }, [listQuery.data, lazyTreeRows, hierarchyMeta, expandedTreeIds, emptyTreeParents]);

  useEffect(() => {
    if (!client || !session || !hierarchyMeta?.hierarchical) return;
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
  }, [client, session, hierarchyMeta?.hierarchical, props.model, rpcContext, listDomain]);

  useEffect(() => {
    if (!client || !session || !hierarchyMeta?.hierarchical) return;
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
          props.onOpenAction(hit.ref, "email");
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
    if (!client || !hierarchyMeta?.parentField || !hierarchyMeta.sequenceField) return;
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
        await client.model(props.model, "write", [[id], { [field]: sequence }], rpcContext);
      }
      setNotice(`Reordered ${ordered.length} sibling(s)`);
      props.onHistory?.("tree:reorder");
      setLazyTreeRows([]);
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
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
    queryKey: ["model", props.model, "count", JSON.stringify(listDomain)],
    enabled: Boolean(client && treeViewQuery.isSuccess),
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

  const recordQuery = useQuery({
    queryKey: ["model", props.model, selectedId],
    enabled: Boolean(client && selectedId),
    queryFn: async (): Promise<{ recordId: number; values: RecordValues } | null> => {
      const requestedId = selectedId;
      if (!client || requestedId == null) return null;
      const fieldNames = [
        ...new Set([
          ...Object.keys(formViewQuery.data?.fields ?? { name: true }),
          "create_date",
          "write_date",
          "create_uid",
          "write_uid",
          "rec_name",
        ]),
      ];
      const result = await client.model(
        props.model,
        "read",
        [[requestedId], fieldNames],
        rpcContext,
      );
      const values = Array.isArray(result) ? (result[0] as RecordValues) : null;
      if (!values) return null;
      return { recordId: requestedId, values };
    },
  });

  useEffect(() => {
    const nextId = props.initialSelectedId ?? null;
    screenGenerationRef.current += 1;
    if (onChangeTimer.current) {
      clearTimeout(onChangeTimer.current);
      onChangeTimer.current = null;
    }
    setScreen((current) => screenForSelection(current, props.model, nextId));
    setSelectedId(nextId);
    setSelectedIds([]);
  }, [props.model, props.initialSelectedId]);

  useEffect(() => {
    const payload = recordQuery.data;
    if (!payload) return;
    setScreen((current) =>
      hydrateSelectedScreen(current, props.model, selectedId, payload.recordId, payload.values),
    );
  }, [recordQuery.data, props.model, selectedId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `epiton.tree.hidden.${props.model}`,
        JSON.stringify(hiddenOptionalCols),
      );
    } catch {
      /* ignore */
    }
  }, [hiddenOptionalCols, props.model]);

  const isDirty = mode === "write" && screenIsDirty(screen);
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
      if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    };
  }, []);

  const aclQuery = useQuery({
    queryKey: ["model", props.model, "acl"],
    enabled: Boolean(client),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) return null;
      return modelHasAccessRows(client, props.model);
    },
  });

  function scheduleOnChange(name: string, nextDraft: RecordValues) {
    if (!client || mode !== "write") return;
    const fields = formViewQuery.data?.fields;
    if (!fields) return;
    if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    const expected = {
      generation: screenGenerationRef.current,
      model: props.model,
      recordId: screenRef.current.recordId,
    };
    onChangeTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const patch = await applyFieldChange(
            client,
            props.model,
            fields,
            nextDraft,
            name,
            rpcContext,
          );
          if (Object.keys(patch).length === 0) return;
          const current = screenRef.current;
          if (
            !acceptAsyncScreenUpdate(expected, {
              generation: screenGenerationRef.current,
              model: current.model,
              recordId: current.recordId,
            })
          ) {
            return;
          }
          setDraft((d) => ({ ...d, ...patch }));
          props.onHistory?.(`on_change:${name}`);
        } catch (err) {
          const current = screenRef.current;
          if (
            !acceptAsyncScreenUpdate(expected, {
              generation: screenGenerationRef.current,
              model: current.model,
              recordId: current.recordId,
            })
          ) {
            return;
          }
          setNotice(err instanceof Error ? err.message : "on_change failed");
        }
      })();
    }, 280);
  }

  function handleFieldChange(name: string, value: unknown) {
    setDraft((d) => {
      const next = { ...d, [name]: value };
      scheduleOnChange(name, next);
      return next;
    });
  }

  async function startNew() {
    if (!confirmDiscard()) return;
    bumpScreenGeneration();
    const expected = {
      generation: screenGenerationRef.current,
      model: props.model,
      recordId: null as number | null,
    };
    setSelectedId(null);
    props.onSelectedIdChange?.(null);
    setMode("write");
    setScreen(createScreen(props.model, null));
    props.onHistory?.("new");
    if (!client) return;
    const fieldNames = Object.keys(formViewQuery.data?.fields ?? {});
    try {
      const defaults = await client.model(
        props.model,
        "default_get",
        [fieldNames.length ? fieldNames : ["name", "active"]],
        rpcContext,
      );
      const next =
        defaults && typeof defaults === "object" && !Array.isArray(defaults)
          ? (defaults as RecordValues)
          : {};
      setScreen((current) =>
        shouldApplyNewDefaults(
          expected,
          {
            generation: screenGenerationRef.current,
            model: current.model,
            recordId: current.recordId,
          },
          current,
        )
          ? createScreen(props.model, null, next)
          : current,
      );
    } catch {
      setScreen((current) =>
        shouldApplyNewDefaults(
          expected,
          {
            generation: screenGenerationRef.current,
            model: current.model,
            recordId: current.recordId,
          },
          current,
        )
          ? createScreen(props.model, null)
          : current,
      );
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      // Invalidate in-flight on_change so a late patch cannot dirty post-write baseline.
      bumpScreenGeneration();
      const currentScreen = screenRef.current;
      if (!isScreenReadyToSave(currentScreen, selectedId)) {
        throw new Error(
          selectedId == null
            ? "New record Screen is not ready"
            : "Selected record is still loading",
        );
      }
      const fieldMeta = formViewQuery.data?.fields ?? {};
      const values = screenValuesForSave(currentScreen, fieldMeta) as JsonObject;
      if (selectedId) {
        await client.model(props.model, "write", [[selectedId], values], rpcContext);
        props.onHistory?.("write");
        return selectedId;
      }
      const created = await client.model(props.model, "create", [[values]], rpcContext);
      const id = Array.isArray(created) ? Number(created[0]) : Number(created);
      props.onHistory?.("create");
      return id;
    },
    onSuccess: async (id) => {
      selectId(id, true);
      leaveWriteMode();
      dirtyRef.current = false;
      setScreen((current) => createScreen(props.model, id, current.values));
      setNotice("Saved");
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    },
  });

  const canSave = isScreenReadyToSave(screen, selectedId);

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!client || !ids.length) throw new Error("Nothing selected");
      await client.model(props.model, "delete", [ids], rpcContext);
      props.onHistory?.("delete");
    },
    onSuccess: async () => {
      selectId(null, true);
      setMultiSelect([]);
      setScreen(createScreen(props.model, null));
      setPendingDeleteIds(null);
      setNotice("Deleted");
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    },
    onError: (err) => {
      setPendingDeleteIds(null);
      setNotice(err instanceof Error ? err.message : "Delete failed");
    },
  });

  function requestDelete(ids: number[]) {
    if (!ids.length) {
      setNotice("Nothing selected");
      return;
    }
    setPendingDeleteIds(ids);
  }

  function selectAdjacent(delta: -1 | 1) {
    const ids = ((listQuery.data ?? []) as Array<Record<string, unknown>>)
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n));
    if (!ids.length) return;
    const idx = selectedId == null ? -1 : ids.indexOf(selectedId);
    let nextIdx: number;
    if (idx < 0) nextIdx = delta > 0 ? 0 : ids.length - 1;
    else nextIdx = Math.min(ids.length - 1, Math.max(0, idx + delta));
    const next = ids[nextIdx];
    if (next == null || next === selectedId) return;
    selectId(next);
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
        if (mode === "write" && isScreenReadyToSave(screenRef.current, selectedId)) {
          saveMutation.mutate();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !typing) {
        e.preventDefault();
        void keyHandlersRef.current.startNew();
        return;
      }
      if (e.key === "F5" && !typing) {
        e.preventDefault();
        void listQuery.refetch();
        return;
      }
      if (e.key === "Delete" && !typing && (selectedId || selectedIds.length)) {
        e.preventDefault();
        keyHandlersRef.current.requestDelete(
          selectedIds.length ? selectedIds : selectedId ? [selectedId] : [],
        );
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !typing) {
        e.preventDefault();
        keyHandlersRef.current.selectAdjacent(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Escape" && mode === "write" && !typing) {
        if (!keyHandlersRef.current.confirmDiscard()) return;
        screenGenerationRef.current += 1;
        if (onChangeTimer.current) {
          clearTimeout(onChangeTimer.current);
          onChangeTimer.current = null;
        }
        if (recordQuery.data) {
          setScreen(createScreen(props.model, selectedId, recordQuery.data.values));
        }
        setMode("read");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, saveMutation, selectedId, selectedIds, listQuery, recordQuery.data, props.model]);

  async function runButton(name: string, meta?: { type?: string }) {
    if (!client || !selectedId) {
      setNotice("Select a record before running a button");
      return;
    }
    const buttonType = (meta?.type ?? "").toLowerCase();
    const looksLikeAction =
      buttonType === "action" ||
      /^(ir\.action\.|act_|wizard\.|report\.)/i.test(name) ||
      /^[\w.-]+,[\d]+$/.test(name);
    if (looksLikeAction && props.onOpenAction) {
      setNotice(`Opening action ${name}…`);
      props.onOpenAction(name, `button:${name}`);
      props.onHistory?.(`button:action:${name}`);
      return;
    }
    const ids = selectedIds.length ? selectedIds : [selectedId];
    setNotice(`Running ${name}…`);
    try {
      await client.model(props.model, name, [ids], {
        ...rpcContext,
        active_id: ids[0]!,
        active_ids: ids,
        active_model: props.model,
      });
      props.onHistory?.(`button:${name}`);
      setNotice(`Button ${name} OK (${ids.length})`);
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Button failed");
    }
  }

  const treeIsEditable = useMemo(
    () => forceTreeEdit || (treeViewQuery.data ? treeEditable(treeViewQuery.data) : false),
    [forceTreeEdit, treeViewQuery.data],
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
    if (!client) return;
    try {
      setNotice(`Writing ${field}…`);
      await client.model(
        props.model,
        "write",
        [[id], { [field]: value } as JsonObject],
        rpcContext,
      );
      setNotice(`Updated #${id}.${field}`);
      props.onHistory?.(`tree:write:${field}`);
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Tree write failed");
    }
  }

  async function runTreeButton(
    id: number,
    action: { name: string; type?: string; confirm?: string },
  ) {
    if (!client) return;
    selectId(id);
    const buttonType = (action.type ?? "").toLowerCase();
    const looksLikeAction =
      buttonType === "action" ||
      /^(ir\.action\.|act_|wizard\.|report\.)/i.test(action.name) ||
      /^[\w.-]+,[\d]+$/.test(action.name);
    if (looksLikeAction && props.onOpenAction) {
      props.onOpenAction(action.name, `tree-button:${action.name}`);
      props.onHistory?.(`tree-button:action:${action.name}`);
      return;
    }
    setNotice(`Running ${action.name} on #${id}…`);
    try {
      await client.model(props.model, action.name, [[id]], {
        ...rpcContext,
        active_id: id,
        active_ids: [id],
        active_model: props.model,
      });
      props.onHistory?.(`tree-button:${action.name}`);
      setNotice(`Button ${action.name} OK`);
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Tree button failed");
    }
  }

  async function addTreeRow() {
    if (!client) return;
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
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Create row failed");
    }
  }

  const calendarEvents = useMemo(
    () =>
      rowsToCalendarEvents((listQuery.data ?? []) as Array<Record<string, unknown>>, {
        startField: calendarSpec?.dtstart,
        endField: calendarSpec?.dtend,
        titleField: calendarSpec?.titleField,
        colorField: calendarSpec?.color,
      }),
    [listQuery.data, calendarSpec],
  );

  async function createCalendarAt(startIso: string, endIso: string | null) {
    if (!client) return;
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
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Calendar create failed");
    }
  }

  async function dropCalendarEvent(id: number, startIso: string, endIso: string | null) {
    if (!client) return;
    const startField = calendarSpec?.dtstart ?? "start";
    const endField = calendarSpec?.dtend;
    const values: JsonObject = {
      [startField]: startIso.includes("T") ? startIso.replace("T", " ").slice(0, 19) : startIso,
    };
    if (endField && endIso) {
      values[endField] = endIso.includes("T") ? endIso.replace("T", " ").slice(0, 19) : endIso;
    }
    try {
      await client.model(props.model, "write", [[id], values], rpcContext);
      props.onHistory?.("calendar:drop");
      setNotice(`Moved #${id}`);
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
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
        (listQuery.data ?? []) as Array<Record<string, unknown>>,
        graphFields.xField,
        graphFields.yField,
        graphFields.yOperator,
      ),
    [listQuery.data, graphFields],
  );

  const graphMulti = useMemo(() => {
    if (graphFields.yFields.length <= 1) return undefined;
    return rowsToMultiSeries(
      (listQuery.data ?? []) as Array<Record<string, unknown>>,
      graphFields.xField,
      graphFields.yFields,
    );
  }, [listQuery.data, graphFields]);

  const graphInsight = useMemo(() => summarizeSeries(graphData), [graphData]);

  const aclWarning = strictAclCoach(props.model, aclQuery.data ?? null);
  const listState = listQuery.isLoading
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

  return (
    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.1fr 1fr" }}>
      <ConfirmDialog
        open={pendingDeleteIds != null}
        title={`Delete ${pendingDeleteIds?.length ?? 0} ${props.model} record(s)?`}
        description="This permanently removes the selected records on the Tryton server."
        confirmLabel="Delete"
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
        {domainTabs.length ? (
          <Tabs aria-label="Action domains" className="epiton-domain-tabs">
            <Tab
              active={domainTab < 0}
              onClick={() => {
                setDomainTab(-1);
                setOffset(0);
              }}
            >
              All
            </Tab>
            {domainTabs.map((tab, index) => (
              <Tab
                key={`${tab.name}-${index}`}
                active={domainTab === index}
                onClick={() => {
                  setDomainTab(index);
                  setOffset(0);
                }}
              >
                {tab.name}
                {tab.count && domainCountQuery.data?.[index] != null
                  ? ` (${domainCountQuery.data[index]})`
                  : ""}
              </Tab>
            ))}
          </Tabs>
        ) : null}
        <div className="epiton-toolbar">
          <Button variant="primary" onClick={() => void startNew()}>
            {t("workspace.new")}
          </Button>
          <Button onClick={() => listQuery.refetch()}>{t("workspace.refresh")}</Button>
          <Button onClick={() => setViewMode("tree")}>{t("workspace.tree")}</Button>
          <Button
            variant={forceTreeEdit || treeIsEditable ? "primary" : "default"}
            onClick={() => setForceTreeEdit((v) => !v)}
          >
            {t("workspace.inlineEdit")}
            {treeIsEditable ? " · on" : ""}
          </Button>
          <Button onClick={() => setViewMode("list-form")}>{t("workspace.listForm")}</Button>
          <Button onClick={() => setViewMode("calendar")}>{t("workspace.calendar")}</Button>
          <Button onClick={() => setViewMode("graph")}>{t("workspace.graph")}</Button>
          <Button
            variant="danger"
            disabled={!selectedIds.length && !selectedId}
            onClick={() =>
              requestDelete(selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
            }
          >
            {t("workspace.delete")}
            {selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
          </Button>
          <Button
            disabled={!client || (!selectedIds.length && !selectedId)}
            onClick={() => void copySelected()}
          >
            {t("workspace.copy")}
          </Button>
          <Button
            disabled={!client || (!selectedIds.length && !selectedId && !listQuery.data?.length)}
            onClick={() => setCsvExportOpen(true)}
          >
            {t("workspace.exportCsv")}
          </Button>
          <Button disabled={!client} onClick={() => importInputRef.current?.click()}>
            {t("workspace.importCsv")}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-label="Import CSV file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importCsvFile(file);
            }}
          />
        </div>
        <div className="epiton-toolbar">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setOffset(0);
                setSearchQuery(searchInput);
              }
            }}
            placeholder="Search name/code, id, or JSON domain"
            aria-label="Domain search"
            style={{ flex: 1, minWidth: "12rem" }}
          />
          <Button
            onClick={() => {
              setOffset(0);
              setSearchQuery(searchInput);
            }}
          >
            {t("workspace.filter")}
          </Button>
          <Button
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
              setOffset(0);
            }}
          >
            {t("workspace.clear")}
          </Button>
          <select
            aria-label="Saved searches"
            value=""
            disabled={!viewSearchesQuery.data?.length}
            onChange={(e) => {
              const id = Number(e.target.value);
              e.target.value = "";
              const row = viewSearchesQuery.data?.find((r) => r.id === id);
              if (!row) return;
              const text =
                typeof row.domain === "string" ? row.domain : JSON.stringify(row.domain ?? []);
              setSearchInput(text);
              setSearchQuery(text);
              setOffset(0);
              setNotice(`Applied saved search “${row.name}”`);
            }}
          >
            <option value="">Saved searches…</option>
            {(viewSearchesQuery.data ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.user == null ? " (shared)" : ""}
              </option>
            ))}
          </select>
          <Button
            disabled={!client || !session || !searchQuery.trim()}
            onClick={() => setSavedSearchDialog("save")}
          >
            Save filter
          </Button>
          <Button
            variant="ghost"
            disabled={!viewSearchesQuery.data?.length}
            onClick={() => setSavedSearchDialog("delete")}
          >
            Delete filter
          </Button>
        </div>
        <SavedSearchDialog
          mode={savedSearchDialog === "delete" ? "delete" : "save"}
          open={savedSearchDialog != null}
          rows={viewSearchesQuery.data}
          onCancel={() => setSavedSearchDialog(null)}
          onSave={(name) => {
            void (async () => {
              if (!client || !session) return;
              try {
                const domain = buildSearchDomain(searchQuery, searchFields);
                await createViewSearch(
                  client,
                  {
                    name,
                    model: props.model,
                    domain: (domain as JsonValue) ?? [],
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
            })();
          }}
          onDelete={(id) => {
            void (async () => {
              if (!client) return;
              try {
                await deleteViewSearch(client, id, rpcContext);
                await viewSearchesQuery.refetch();
                setNotice(`Deleted saved search #${id}`);
                setSavedSearchDialog(null);
              } catch (err) {
                setNotice(err instanceof Error ? err.message : "Delete search failed");
              }
            })();
          }}
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
          message={listQuery.isError ? listQuery.error.message : "No records"}
        >
          {viewMode === "calendar" ? (
            <CalendarView
              events={calendarEvents}
              editable
              onSelect={(id) => {
                selectId(id);
                leaveWriteMode();
                props.onHistory?.("open");
              }}
              onCreateAt={(start, end) => void createCalendarAt(start, end)}
              onEventDrop={(id, start, end) => void dropCalendarEvent(id, start, end)}
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
                const hit = ((listQuery.data ?? []) as Array<Record<string, unknown>>).find(
                  (row) => {
                    const name = String(row.rec_name ?? row.name ?? row.code ?? row.id ?? "");
                    return name === label || String(row.id) === label;
                  },
                );
                if (!hit) return;
                const id = Number(hit.id);
                if (!Number.isFinite(id)) return;
                selectId(id);
                void openKeywordAction("graph_open", id, "graph_open").then((opened) => {
                  if (!opened) props.onHistory?.("graph:select");
                });
              }}
            />
          ) : viewMode === "list-form" ? (
            <ListFormView
              rows={(listQuery.data ?? []) as Array<Record<string, unknown>>}
              view={listFormViewQuery.data}
              columns={displayColumns}
              density={density}
              selectedId={selectedId}
              onSelect={(id) => {
                selectId(id);
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
                selectId(id);
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
                setMultiSelect(
                  selectedIds.includes(id)
                    ? selectedIds.filter((x) => x !== id)
                    : [...selectedIds, id],
                );
              }}
              onSelect={(id) => {
                selectId(id);
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
        <div className="epiton-toolbar">
          <Button
            onClick={() => {
              if (mode === "write" && !confirmDiscard()) return;
              if (mode === "write") {
                if (recordQuery.data) {
                  setScreen(createScreen(props.model, selectedId, recordQuery.data.values));
                }
                leaveWriteMode();
                return;
              }
              setMode("write");
            }}
          >
            {t("workspace.mode")}: {mode}
          </Button>
          <Badge tone={mode === "write" ? "accent" : "muted"}>{mode}</Badge>
          {isDirty ? <Badge tone="accent">{t("workspace.unsaved")}</Badge> : null}
          <Button
            variant="primary"
            disabled={saveMutation.isPending || !canSave}
            onClick={() => saveMutation.mutate()}
          >
            {t("workspace.save")}
          </Button>
          <Button
            variant="danger"
            disabled={!selectedId}
            onClick={() => selectedId && requestDelete([selectedId])}
          >
            {t("workspace.delete")}
          </Button>
          <Button disabled={!client || !selectedId} onClick={() => void copySelected()}>
            {t("workspace.copy")}
          </Button>
          <Button disabled={!selectedId} onClick={() => setShowHistory((v) => !v)}>
            {t("workspace.history")}
          </Button>
          <Button disabled={!selectedId} onClick={() => void openEmail()}>
            {t("workspace.email")}
          </Button>
        </div>
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
            onRestore={(values) => {
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
              setNotice("History values loaded into draft — Save to write");
              props.onHistory?.("history:restore");
            }}
          />
        ) : null}{" "}
        {props.onOpenAction ? (
          <RecordActionsMenu
            model={props.model}
            recordId={selectedId}
            onOpen={(ref, source) => props.onOpenAction?.(ref, source)}
          />
        ) : null}
        {formViewQuery.data
          ? renderView(formViewQuery.data, {
              values: draft,
              mode,
              density,
              model: props.model,
              onChange: handleFieldChange,
              onButton: (name, meta) => void runButton(name, meta),
              onOpenRelation: (field, value, domain) => {
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
            mode={mode}
            onCancel={() => {
              setRelationField(null);
              setRelationDomain(undefined);
            }}
            onPick={(id, recName) => {
              const nextVal: [number, string] = [id, recName];
              setDraft((d) => {
                const next = { ...d, [relationField.name]: nextVal };
                scheduleOnChange(relationField.name, next);
                return next;
              });
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : relationField && activeRelationQueue ? (
          <RelationLinesEditor
            field={relationField}
            value={draft[relationField.name]}
            mode={mode}
            recordValues={draft}
            domain={relationDomain}
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
            onCommit={() => {
              setRelationField(null);
              setRelationDomain(undefined);
              setNotice("Relation commands queued — Save parent to write");
              props.onHistory?.(`relation:apply:${relationField.name}`);
            }}
          />
        ) : null}
        {saveMutation.isError ? <Alert tone="danger">{saveMutation.error.message}</Alert> : null}
      </Panel>
    </div>
  );
}

function domainTabStorageKey(
  model: string,
  domains?: Array<{ name: string }> | null,
): string | null {
  if (!domains?.length) return null;
  return `epiton.domainTab.${model}.${domains.map((d) => d.name).join("|")}`;
}
