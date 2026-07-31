import { strictAclCoach } from "@epiton/intelligence";
import { modelHasAccessRows } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type RecordValues,
  type ViewField,
  type WidgetRegistry,
  clinicalWidgetRegistry,
  parseFieldsViewGet,
  renderView,
  treeColumns,
} from "@epiton/view-engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import { RelationLinesEditor } from "./RelationLinesEditor";
import { VirtualPartyTable } from "./VirtualPartyTable";

const DEFAULT_FIELDS = ["id", "rec_name", "name", "code", "active"];

/** Generic Tryton model workspace — opens any model via fields_view_get + CRUD.
 * Remount with `key={model}` from the shell when switching models.
 */
export function ModelWorkspace(props: {
  model: string;
  useClinicalWidgets?: boolean;
  onHistory?: (action: string) => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RecordValues>({});
  const [mode, setMode] = useState<"read" | "write">("read");
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const widgets: WidgetRegistry | undefined = props.useClinicalWidgets
    ? clinicalWidgetRegistry()
    : undefined;

  const formViewQuery = useQuery({
    queryKey: ["model", props.model, "form-view"],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(await client.fieldsViewGet(props.model, null, "form"));
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
    queryKey: ["model", props.model, "tree-view"],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(await client.fieldsViewGet(props.model, null, "tree"));
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

  const listFields = useMemo(() => {
    const cols = treeViewQuery.data ? treeColumns(treeViewQuery.data).map((c) => c.name) : [];
    const merged = [...new Set(["id", ...cols, ...DEFAULT_FIELDS])];
    return merged.slice(0, 12);
  }, [treeViewQuery.data]);

  const listQuery = useQuery({
    queryKey: ["model", props.model, "list", listFields.join(",")],
    enabled: Boolean(client && treeViewQuery.isSuccess),
    queryFn: async () => {
      if (!client) return [];
      try {
        return await client.searchRead(props.model, [], listFields, 0, 80, null);
      } catch {
        return await client.searchRead(props.model, [], ["id"], 0, 80, null);
      }
    },
  });

  const recordQuery = useQuery({
    queryKey: ["model", props.model, selectedId],
    enabled: Boolean(client && selectedId),
    queryFn: async () => {
      if (!client || !selectedId) return null;
      const fieldNames = Object.keys(formViewQuery.data?.fields ?? { name: true });
      const result = await client.model(props.model, "read", [[selectedId], fieldNames], {});
      return Array.isArray(result) ? (result[0] as RecordValues) : null;
    },
  });

  useEffect(() => {
    if (recordQuery.data) setDraft(recordQuery.data);
  }, [recordQuery.data]);

  const aclQuery = useQuery({
    queryKey: ["model", props.model, "acl"],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return null;
      return modelHasAccessRows(client, props.model);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      const fieldMeta = formViewQuery.data?.fields ?? {};
      const values: Record<string, string | number | boolean | null> = {};
      for (const [key, meta] of Object.entries(fieldMeta)) {
        if (meta.readonly) continue;
        if (!(key in draft)) continue;
        const raw = draft[key];
        if (meta.type === "boolean") values[key] = Boolean(raw);
        else if (raw == null || raw === "") values[key] = null;
        else if (typeof raw === "number" || typeof raw === "boolean") values[key] = raw;
        else if (typeof raw === "string") values[key] = raw;
      }
      if (selectedId) {
        await client.model(props.model, "write", [[selectedId], values], {});
        props.onHistory?.("write");
        return selectedId;
      }
      const created = await client.model(props.model, "create", [[values]], {});
      const id = Array.isArray(created) ? Number(created[0]) : Number(created);
      props.onHistory?.("create");
      return id;
    },
    onSuccess: async (id) => {
      setSelectedId(id);
      setMode("read");
      setNotice("Saved");
      await queryClient.invalidateQueries({ queryKey: ["model", props.model] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!client || !selectedId) throw new Error("Nothing selected");
      if (!globalThis.confirm(`Delete ${props.model} #${selectedId}?`)) return;
      await client.model(props.model, "delete", [[selectedId]], {});
      props.onHistory?.("delete");
    },
    onSuccess: async () => {
      setSelectedId(null);
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
      await client.model(props.model, name, [[selectedId]], {});
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

  const aclWarning = strictAclCoach(props.model, aclQuery.data ?? null);
  const listState = listQuery.isLoading
    ? "loading"
    : listQuery.isError
      ? "error"
      : listQuery.data?.length
        ? "data"
        : "empty";

  return (
    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.1fr 1fr" }}>
      <Panel title={props.model}>
        <div className="epiton-toolbar">
          <Button
            variant="primary"
            onClick={() => {
              setSelectedId(null);
              setDraft({});
              setMode("write");
              props.onHistory?.("new");
            }}
          >
            New
          </Button>
          <Button onClick={() => listQuery.refetch()}>Refresh</Button>
        </div>
        <StateBlock
          state={listState}
          message={listQuery.isError ? listQuery.error.message : "No records"}
        >
          <VirtualPartyTable
            rows={(listQuery.data ?? []) as Array<Record<string, unknown>>}
            columns={columns}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setMode("read");
              props.onHistory?.("open");
            }}
          />
        </StateBlock>
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
          <Button variant="danger" disabled={!selectedId} onClick={() => deleteMutation.mutate()}>
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
              onChange: (name, value) => setDraft((d) => ({ ...d, [name]: value })),
              onButton: (name) => void runButton(name),
              onOpenRelation: (field) => {
                setRelationField(field);
                props.onHistory?.(`relation:${field.name}`);
              },
            })
          : recordQuery.isLoading
            ? "Loading…"
            : null}
        {relationField ? (
          <RelationLinesEditor
            field={relationField}
            value={draft[relationField.name]}
            mode={mode}
            onCommit={(next) => {
              setDraft((d) => ({ ...d, [relationField.name]: next }));
              setRelationField(null);
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
