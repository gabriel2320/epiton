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
  type WidgetRegistry,
  aggregateGraphData,
  buildSearchDomain,
  clinicalWidgetRegistry,
  evalContext,
  evalDomain,
  flattenTreeRows,
  formatOrder,
  inferGraphFields,
  isTrytonRelationCommands,
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
  toTrytonM2M,
  treeButtons,
  treeColumns,
  treeEditable,
  treeEditablePlacement,
  treeMeta,
} from "@epiton/view-engine";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { VirtualPartyTable } from "./VirtualPartyTable";

const DEFAULT_FIELDS = ["id", "rec_name", "name", "code", "active"];
const PAGE_SIZE_OPTIONS = [40, 80, 120, 200] as const;

function noticeTone(message: string): "default" | "accent" | "danger" | "muted" {
  if (/fail|error|before running|nothing selected/i.test(message)) return "danger";
  if (/…|\.\.\.|importing|exporting|copying|running/i.test(message)) return "muted";
  if (/saved|ok|exported|imported|copied/i.test(message)) return "accent";
  return "default";
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "number") return item;
      if (Array.isArray(item) && typeof item[0] === "number") return item[0];
      if (item && typeof item === "object" && "id" in item)
        return Number((item as { id: unknown }).id);
      return Number.NaN;
    })
    .filter((n) => Number.isFinite(n));
}

/** Generic Tryton model workspace — opens any model via fields_view_get + CRUD.
 * Remount with `key={model}` from the shell when switching models.
 */
export function ModelWorkspace(props: {
  model: string;
  useClinicalWidgets?: boolean;
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
  const [selectedId, setSelectedId] = useState<number | null>(props.initialSelectedId ?? null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<RecordValues>({});
  const [mode, setMode] = useState<"read" | "write">("read");
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
  const [treeM2O, setTreeM2O] = useState<{
    id: number;
    field: ViewField;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const widgets: WidgetRegistry | undefined = props.useClinicalWidgets
    ? clinicalWidgetRegistry()
    : undefined;

  function selectId(id: number | null) {
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
    return merged.slice(0, 28);
  }, [treeViewQuery.data, props.model, calendarSpec]);
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

  const listDomain = useMemo(() => {
    const search = buildSearchDomain(searchQuery);
    return mergeDomains(mergeDomains(resolvedActionDomain, activeTabDomain), search);
  }, [resolvedActionDomain, activeTabDomain, searchQuery]);

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
        return await client.searchRead(props.model, [], ["id"], offset, pageSize, null, rpcContext);
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
    queryFn: async () => {
      if (!client || !selectedId) return null;
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
        [[selectedId], fieldNames],
        rpcContext,
      );
      return Array.isArray(result) ? (result[0] as RecordValues) : null;
    },
  });

  useEffect(() => {
    if (recordQuery.data) setDraft(recordQuery.data);
  }, [recordQuery.data]);

  useEffect(() => {
    if (props.initialSelectedId == null) return;
    setSelectedId(props.initialSelectedId);
    props.onSelectedIdChange?.(props.initialSelectedId);
  }, [props.initialSelectedId, props.onSelectedIdChange]);

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
          setDraft((d) => ({ ...d, ...patch }));
          props.onHistory?.(`on_change:${name}`);
        } catch (err) {
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
    selectId(null);
    setMode("write");
    props.onHistory?.("new");
    if (!client) {
      setDraft({});
      return;
    }
    const fieldNames = Object.keys(formViewQuery.data?.fields ?? {});
    try {
      const defaults = await client.model(
        props.model,
        "default_get",
        [fieldNames.length ? fieldNames : ["name", "active"]],
        rpcContext,
      );
      setDraft(
        defaults && typeof defaults === "object" && !Array.isArray(defaults)
          ? (defaults as RecordValues)
          : {},
      );
    } catch {
      setDraft({});
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      const fieldMeta = formViewQuery.data?.fields ?? {};
      const values: Record<string, unknown> = {};
      for (const [key, meta] of Object.entries(fieldMeta)) {
        if (meta.readonly) continue;
        if (!(key in draft)) continue;
        const raw = draft[key];
        if (meta.type === "boolean") values[key] = Boolean(raw);
        else if (raw == null || raw === "") values[key] = null;
        else if (meta.type === "many2one") {
          values[key] = Array.isArray(raw) ? (raw[0] ?? null) : raw;
        } else if (meta.type === "many2many") {
          // Preserve command lists from RelationLinesEditor; otherwise add existing ids.
          values[key] = isTrytonRelationCommands(raw) ? raw : toTrytonM2M(normalizeIds(raw));
        } else if (meta.type === "one2many") {
          // Preserve command lists from RelationLinesEditor; otherwise add existing ids.
          if (isTrytonRelationCommands(raw)) {
            values[key] = raw;
          } else {
            values[key] = normalizeIds(raw).map((id) => ["add", [id]]);
          }
        } else if (meta.type === "reference") {
          values[key] = raw;
        } else if (meta.type === "dict" || meta.type === "multiselection") {
          values[key] = raw;
        } else if (typeof raw === "number" || typeof raw === "boolean") values[key] = raw;
        else if (typeof raw === "string") values[key] = raw;
      }
      if (selectedId) {
        await client.model(props.model, "write", [[selectedId], values as JsonObject], rpcContext);
        props.onHistory?.("write");
        return selectedId;
      }
      const created = await client.model(
        props.model,
        "create",
        [[values as JsonObject]],
        rpcContext,
      );
      const id = Array.isArray(created) ? Number(created[0]) : Number(created);
      props.onHistory?.("create");
      return id;
    },
    onSuccess: async (id) => {
      selectId(id);
      setMode("read");
      setNotice("Saved");
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!client || !ids.length) throw new Error("Nothing selected");
      await client.model(props.model, "delete", [ids], rpcContext);
      props.onHistory?.("delete");
    },
    onSuccess: async () => {
      selectId(null);
      setMultiSelect([]);
      setDraft({});
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
        if (mode === "write") saveMutation.mutate();
        return;
      }
      if (e.key === "Escape" && mode === "write" && !typing) {
        setMode("read");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, saveMutation]);

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
        chartType: graphSpec.type,
      };
    }
    const names = columns.map((c) => c.name);
    const inferred = inferGraphFields(names);
    return {
      xField: inferred.xField,
      yField: inferred.yField,
      yFields: [inferred.yField],
      chartType: "vbar" as const,
    };
  }, [columns, graphSpec]);

  const graphData = useMemo(
    () =>
      aggregateGraphData(
        (listQuery.data ?? []) as Array<Record<string, unknown>>,
        graphFields.xField,
        graphFields.yField,
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
            New
          </Button>
          <Button onClick={() => listQuery.refetch()}>Refresh</Button>
          <Button onClick={() => setViewMode("tree")}>Tree</Button>
          <Button
            variant={forceTreeEdit || treeIsEditable ? "primary" : "default"}
            onClick={() => setForceTreeEdit((v) => !v)}
          >
            Inline edit{treeIsEditable ? " · on" : ""}
          </Button>
          <Button onClick={() => setViewMode("list-form")}>List-form</Button>
          <Button onClick={() => setViewMode("calendar")}>Calendar</Button>
          <Button onClick={() => setViewMode("graph")}>Graph</Button>
          <Button
            variant="danger"
            disabled={!selectedIds.length && !selectedId}
            onClick={() =>
              requestDelete(selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
            }
          >
            Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
          </Button>
          <Button
            disabled={!client || (!selectedIds.length && !selectedId)}
            onClick={() => void copySelected()}
          >
            Copy
          </Button>
          <Button
            disabled={!client || (!selectedIds.length && !selectedId && !listQuery.data?.length)}
            onClick={() => setCsvExportOpen(true)}
          >
            Export CSV
          </Button>
          <Button disabled={!client} onClick={() => importInputRef.current?.click()}>
            Import CSV
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
            Filter
          </Button>
          <Button
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
              setOffset(0);
            }}
          >
            Clear
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
            onClick={() => {
              void (async () => {
                if (!client || !session) return;
                const name = globalThis.prompt("Name for saved search");
                if (!name?.trim()) return;
                try {
                  const domain = buildSearchDomain(searchQuery);
                  await createViewSearch(
                    client,
                    {
                      name: name.trim(),
                      model: props.model,
                      domain: (domain as JsonValue) ?? [],
                      user: session.userId,
                    },
                    rpcContext,
                  );
                  await viewSearchesQuery.refetch();
                  setNotice(`Saved search “${name.trim()}”`);
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : "Could not save search");
                }
              })();
            }}
          >
            Save filter
          </Button>
          <Button
            variant="ghost"
            disabled={!viewSearchesQuery.data?.length}
            onClick={() => {
              void (async () => {
                if (!client) return;
                const pick = globalThis.prompt(
                  "Delete saved search id",
                  String(viewSearchesQuery.data?.[0]?.id ?? ""),
                );
                const id = Number(pick);
                if (!Number.isFinite(id)) return;
                try {
                  await deleteViewSearch(client, id, rpcContext);
                  await viewSearchesQuery.refetch();
                  setNotice(`Deleted saved search #${id}`);
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : "Delete search failed");
                }
              })();
            }}
          >
            Delete filter
          </Button>
        </div>
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
                setMode("read");
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
              columns={columns}
              density={density}
              selectedId={selectedId}
              onSelect={(id) => {
                selectId(id);
                setMode("read");
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
              columns={columns}
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
                setMode("read");
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
                setMode("read");
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

      <Panel title={selectedId ? `${props.model} #${selectedId}` : `${props.model} form`}>
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
          <Button onClick={() => setMode(mode === "read" ? "write" : "read")}>Mode: {mode}</Button>
          <Badge tone={mode === "write" ? "accent" : "muted"}>{mode}</Badge>
          <Button
            variant="primary"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
          <Button
            variant="danger"
            disabled={!selectedId}
            onClick={() => selectedId && requestDelete([selectedId])}
          >
            Delete
          </Button>
          <Button disabled={!client || !selectedId} onClick={() => void copySelected()}>
            Copy
          </Button>
          <Button disabled={!selectedId} onClick={() => setShowHistory((v) => !v)}>
            History
          </Button>
          <Button disabled={!selectedId} onClick={() => void openEmail()}>
            Email
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
              setDraft((d) => ({ ...d, ...rest }));
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
              widgets,
              onChange: handleFieldChange,
              onButton: (name, meta) => void runButton(name, meta),
              onOpenRelation: (field, value, domain) => {
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
                  const blob = new Blob([bytes], { type: "application/octet-stream" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${props.model}-${field.name}.bin`;
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
        ) : relationField ? (
          <RelationLinesEditor
            field={relationField}
            value={draft[relationField.name]}
            mode={mode}
            recordValues={draft}
            domain={relationDomain}
            onOpenLine={(model, id) => props.onPushRelated?.(model, id)}
            onCommit={(next) => {
              setDraft((d) => ({ ...d, [relationField.name]: next }));
              setRelationField(null);
              setRelationDomain(undefined);
              setNotice("Relation commands attached — Save parent to write");
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
