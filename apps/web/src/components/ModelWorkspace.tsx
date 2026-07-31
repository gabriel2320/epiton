import { strictAclCoach } from "@epiton/intelligence";
import {
  type JsonObject,
  type JsonValue,
  applyFieldChange,
  modelHasAccessRows,
  viewIdForMode,
} from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type RecordValues,
  type ViewField,
  type WidgetRegistry,
  buildSearchDomain,
  clinicalWidgetRegistry,
  evalContext,
  evalDomain,
  formatOrder,
  inferGraphFields,
  mergeDomains,
  parseFieldsViewGet,
  renderView,
  rowsToCalendarEvents,
  rowsToGraphData,
  toTrytonM2M,
  treeColumns,
} from "@epiton/view-engine";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../lib/store";
import { CalendarView } from "./CalendarView";
import { GraphView } from "./GraphView";
import { RelationLinesEditor } from "./RelationLinesEditor";
import { RelationSearch } from "./RelationSearch";
import { VirtualPartyTable } from "./VirtualPartyTable";

const DEFAULT_FIELDS = ["id", "rec_name", "name", "code", "active"];
const PAGE_SIZE = 80;

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
  onHistory?: (action: string) => void;
  onSelectedIdChange?: (id: number | null) => void;
  onPushRelated?: (model: string, id: number | null) => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(props.initialSelectedId ?? null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<RecordValues>({});
  const [mode, setMode] = useState<"read" | "write">("read");
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [relationDomain, setRelationDomain] = useState<unknown[] | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "calendar" | "graph">("tree");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [sorts, setSorts] = useState<Array<{ id: string; desc: boolean }>>([]);
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const actionCtxOverlay = useMemo(
    () => evalContext(props.actionContext ?? {}, sessionContext),
    [props.actionContext, sessionContext],
  );

  const rpcContext: JsonObject = useMemo(
    () => ({ ...sessionContext, ...actionCtxOverlay }) as JsonObject,
    [sessionContext, actionCtxOverlay],
  );

  const treeViewId = viewIdForMode(props.actionViews, "tree");
  const formViewId = viewIdForMode(props.actionViews, "form");
  const calendarViewId = viewIdForMode(props.actionViews, "calendar");

  const widgets: WidgetRegistry | undefined = props.useClinicalWidgets
    ? clinicalWidgetRegistry()
    : undefined;

  function selectId(id: number | null) {
    setSelectedId(id);
    props.onSelectedIdChange?.(id);
  }

  const formViewQuery = useQuery({
    queryKey: ["model", props.model, "form-view", formViewId],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, formViewId, "form", rpcContext),
        );
      } catch {
        return parseFieldsViewGet({
          arch: `<form><group string="${props.model}"><field name="name"/><field name="active"/></group></form>`,
          fields: {
            name: { type: "char", string: "Name", required: true },
            active: { type: "boolean", string: "Active" },
          },
        });
      }
    },
  });

  const treeViewQuery = useQuery({
    queryKey: ["model", props.model, "tree-view", treeViewId],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, treeViewId, "tree", rpcContext),
        );
      } catch {
        return parseFieldsViewGet({
          arch: `<tree><field name="rec_name"/><field name="name"/></tree>`,
          fields: {
            rec_name: { type: "char", string: "Name" },
            name: { type: "char", string: "Name" },
          },
        });
      }
    },
  });

  const calendarViewQuery = useQuery({
    queryKey: ["model", props.model, "calendar-view", calendarViewId],
    enabled: Boolean(client && viewMode === "calendar"),
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

  const listFields = useMemo(() => {
    const cols = treeViewQuery.data ? treeColumns(treeViewQuery.data).map((c) => c.name) : [];
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
      ]),
    ];
    return merged.slice(0, 16);
  }, [treeViewQuery.data]);

  const resolvedActionDomain = useMemo(
    () => evalDomain(props.actionDomain ?? [], { ...sessionContext, ...actionCtxOverlay }),
    [props.actionDomain, sessionContext, actionCtxOverlay],
  );

  const listDomain = useMemo(() => {
    const search = buildSearchDomain(searchQuery);
    return mergeDomains(resolvedActionDomain, search);
  }, [resolvedActionDomain, searchQuery]);

  const order = useMemo(() => formatOrder(sorts), [sorts]);

  const listQuery = useQuery({
    queryKey: [
      "model",
      props.model,
      "list",
      listFields.join(","),
      JSON.stringify(listDomain),
      offset,
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
          PAGE_SIZE,
          order,
          rpcContext,
        );
      } catch {
        return await client.searchRead(
          props.model,
          [],
          ["id"],
          offset,
          PAGE_SIZE,
          null,
          rpcContext,
        );
      }
    },
  });

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

  const recordQuery = useQuery({
    queryKey: ["model", props.model, selectedId],
    enabled: Boolean(client && selectedId),
    queryFn: async () => {
      if (!client || !selectedId) return null;
      const fieldNames = Object.keys(formViewQuery.data?.fields ?? { name: true });
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
          values[key] =
            Array.isArray(raw) && raw[0] === "add" ? raw : toTrytonM2M(normalizeIds(raw));
        } else if (meta.type === "one2many") {
          // Preserve command lists from RelationLinesEditor; otherwise add existing ids.
          if (
            Array.isArray(raw) &&
            raw.length > 0 &&
            Array.isArray(raw[0]) &&
            typeof raw[0][0] === "string"
          ) {
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
      if (!globalThis.confirm(`Delete ${ids.length} ${props.model} record(s)?`)) return;
      await client.model(props.model, "delete", [ids], rpcContext);
      props.onHistory?.("delete");
    },
    onSuccess: async () => {
      selectId(null);
      setSelectedIds([]);
      setDraft({});
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    },
  });

  async function runButton(name: string) {
    if (!client || !selectedId) {
      setNotice("Select a record before running a button");
      return;
    }
    setNotice(`Running ${name}…`);
    try {
      await client.model(props.model, name, [[selectedId]], rpcContext);
      props.onHistory?.(`button:${name}`);
      setNotice(`Button ${name} OK`);
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Button failed");
    }
  }

  const columns = useMemo(
    () =>
      treeViewQuery.data
        ? treeColumns(treeViewQuery.data)
        : [
            { name: "id", string: "ID" },
            { name: "rec_name", string: "Name" },
          ],
    [treeViewQuery.data],
  );

  const calendarEvents = useMemo(
    () => rowsToCalendarEvents((listQuery.data ?? []) as Array<Record<string, unknown>>),
    [listQuery.data],
  );

  const graphFields = useMemo(() => {
    const names = columns.map((c) => c.name);
    return inferGraphFields(names);
  }, [columns]);

  const graphData = useMemo(
    () =>
      rowsToGraphData(
        (listQuery.data ?? []) as Array<Record<string, unknown>>,
        graphFields.xField,
        graphFields.yField,
      ),
    [listQuery.data, graphFields],
  );

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
    total != null ? offset + PAGE_SIZE < total : (listQuery.data?.length ?? 0) >= PAGE_SIZE;

  return (
    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.1fr 1fr" }}>
      <Panel title={props.model}>
        <div className="epiton-toolbar">
          <Button variant="primary" onClick={() => void startNew()}>
            New
          </Button>
          <Button onClick={() => listQuery.refetch()}>Refresh</Button>
          <Button onClick={() => setViewMode("tree")}>Tree</Button>
          <Button onClick={() => setViewMode("calendar")}>Calendar</Button>
          <Button onClick={() => setViewMode("graph")}>Graph</Button>
          <Button
            variant="danger"
            disabled={!selectedIds.length && !selectedId}
            onClick={() =>
              deleteMutation.mutate(
                selectedIds.length ? selectedIds : selectedId ? [selectedId] : [],
              )
            }
          >
            Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
          </Button>
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
        </div>
        <div className="epiton-toolbar">
          <Button disabled={!canPrev} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            Prev
          </Button>
          <span className="text-sm text-[var(--epiton-muted)]" role="status">
            {offset + 1}–{offset + (listQuery.data?.length ?? 0)}
            {total != null ? ` / ${total}` : ""}
            {order ? ` · ${order}` : ""}
          </span>
          <Button disabled={!canNext} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Next
          </Button>
        </div>
        <StateBlock
          state={listState}
          message={listQuery.isError ? listQuery.error.message : "No records"}
        >
          {viewMode === "calendar" ? (
            <CalendarView
              events={calendarEvents}
              onSelect={(id) => {
                selectId(id);
                setMode("read");
                props.onHistory?.("open");
              }}
            />
          ) : viewMode === "graph" ? (
            <GraphView data={graphData} yLabel={graphFields.yField} />
          ) : (
            <VirtualPartyTable
              rows={(listQuery.data ?? []) as Array<Record<string, unknown>>}
              columns={columns}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSortChange={(next) => {
                setOffset(0);
                setSorts(next);
              }}
              onToggleSelect={(id) => {
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
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
        {calendarViewQuery.data ? (
          <p className="text-sm text-[var(--epiton-muted)]" role="status">
            Server calendar arch available
          </p>
        ) : null}
      </Panel>

      <Panel title={selectedId ? `${props.model} #${selectedId}` : `${props.model} form`}>
        {aclWarning ? <p role="status">{aclWarning.message}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        <div className="epiton-toolbar">
          <Button onClick={() => setMode(mode === "read" ? "write" : "read")}>Mode: {mode}</Button>
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
            onClick={() => selectedId && deleteMutation.mutate([selectedId])}
          >
            Delete
          </Button>
        </div>
        {formViewQuery.data
          ? renderView(formViewQuery.data, {
              values: draft,
              mode,
              density,
              model: props.model,
              widgets,
              onChange: handleFieldChange,
              onButton: (name) => void runButton(name),
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
            onCommit={(next) => {
              setDraft((d) => ({ ...d, [relationField.name]: next }));
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : null}
        {saveMutation.isError ? (
          <p role="alert" style={{ color: "var(--epiton-danger)" }}>
            {saveMutation.error.message}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
