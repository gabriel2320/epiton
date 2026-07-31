import { strictAclCoach } from "@epiton/intelligence";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type RecordValues,
  parseFieldsViewGet,
  renderView,
  treeColumns,
} from "@epiton/view-engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAppStore } from "../lib/store";

export function PartyWorkspace(props: { onHistory: (action: string) => void }) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RecordValues>({ name: "" });
  const [mode, setMode] = useState<"read" | "write">("read");

  const listQuery = useQuery({
    queryKey: ["party.party", "list"],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return [];
      return client.searchRead("party.party", [], ["name", "code"], 0, 50, "name");
    },
  });

  const treeViewQuery = useQuery({
    queryKey: ["party.party", "tree-view"],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(await client.fieldsViewGet("party.party", null, "tree"));
      } catch {
        return parseFieldsViewGet({
          arch: `<tree><field name="name"/><field name="code"/></tree>`,
          fields: {
            name: { type: "char", string: "Name" },
            code: { type: "char", string: "Code" },
          },
        });
      }
    },
  });

  const formViewQuery = useQuery({
    queryKey: ["party.party", "form-view"],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(await client.fieldsViewGet("party.party", null, "form"));
      } catch {
        return parseFieldsViewGet({
          arch: `<form><group string="Party"><field name="name"/><field name="code"/><field name="active"/></group></form>`,
          fields: {
            name: { type: "char", string: "Name", required: true },
            code: { type: "char", string: "Code" },
            active: { type: "boolean", string: "Active" },
          },
        });
      }
    },
  });

  const recordQuery = useQuery({
    queryKey: ["party.party", selectedId],
    enabled: Boolean(client && selectedId),
    queryFn: async () => {
      if (!client || !selectedId) return null;
      const result = await client.model(
        "party.party",
        "read",
        [[selectedId], ["name", "code", "active"]],
        {},
      );
      const row = Array.isArray(result) ? (result[0] as RecordValues) : null;
      if (row) setDraft(row);
      return row;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      const values = {
        name: String(draft.name ?? ""),
        code: draft.code == null || draft.code === "" ? null : String(draft.code),
        active: Boolean(draft.active ?? true),
      };
      if (selectedId) {
        await client.model("party.party", "write", [[selectedId], values], {});
        props.onHistory("write");
        return selectedId;
      }
      const created = await client.model("party.party", "create", [[values]], {});
      const id = Array.isArray(created) ? Number(created[0]) : Number(created);
      props.onHistory("create");
      return id;
    },
    onSuccess: async (id) => {
      setSelectedId(id);
      setMode("read");
      await queryClient.invalidateQueries({ queryKey: ["party.party"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!client || !selectedId) throw new Error("Nothing selected");
      if (!globalThis.confirm("Delete this party?")) return;
      await client.model("party.party", "delete", [[selectedId]], {});
      props.onHistory("delete");
    },
    onSuccess: async () => {
      setSelectedId(null);
      setDraft({ name: "" });
      await queryClient.invalidateQueries({ queryKey: ["party.party"] });
    },
  });

  const columns = useMemo(
    () =>
      treeViewQuery.data ? treeColumns(treeViewQuery.data) : [{ name: "name", string: "Name" }],
    [treeViewQuery.data],
  );

  const aclWarning = strictAclCoach("party.party", null);
  const listState = listQuery.isLoading
    ? "loading"
    : listQuery.isError
      ? "error"
      : listQuery.data?.length
        ? "data"
        : "empty";

  return (
    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.1fr 1fr" }}>
      <Panel title="Parties">
        <div className="epiton-toolbar">
          <Button
            variant="primary"
            onClick={() => {
              setSelectedId(null);
              setDraft({ name: "", code: "", active: true });
              setMode("write");
              props.onHistory("new");
            }}
          >
            New
          </Button>
          <Button onClick={() => listQuery.refetch()}>Refresh</Button>
        </div>
        <StateBlock
          state={listState}
          message={listQuery.isError ? listQuery.error.message : "No parties yet"}
        >
          <table className="epiton-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.name}>{c.string}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(listQuery.data ?? []).map((row) => (
                <tr
                  key={String(row.id)}
                  onClick={() => {
                    setSelectedId(Number(row.id));
                    setMode("read");
                    props.onHistory("open");
                  }}
                >
                  {columns.map((c) => (
                    <td key={c.name}>{String(row[c.name] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </StateBlock>
      </Panel>

      <Panel title={selectedId ? `Party #${selectedId}` : "Party form"}>
        {aclWarning ? <p role="status">{aclWarning.message}</p> : null}
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
              onChange: (name, value) => setDraft((d) => ({ ...d, [name]: value })),
              onButton: (name) => props.onHistory(`button:${name}`),
              onOpenRelation: (field) => props.onHistory(`relation:${field.name}`),
            })
          : recordQuery.isLoading
            ? "Loading…"
            : null}
        {saveMutation.isError ? (
          <p role="alert" style={{ color: "var(--epiton-danger)" }}>
            {saveMutation.error.message}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
