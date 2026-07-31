import type { JsonObject } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type ParsedView,
  type RecordValues,
  parseFieldsViewGet,
  renderView,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

/** Embedded O2M line form: create or edit related values before queuing commands. */
export function RelationLineForm(props: {
  model: string;
  lineId?: number | null;
  context?: JsonObject;
  onCancel: () => void;
  onSave: (values: RecordValues, lineId: number | null) => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const rpcContext: JsonObject = { ...sessionContext, ...(props.context ?? {}) };
  const [draft, setDraft] = useState<RecordValues>({});
  const editing = props.lineId != null;

  const viewQuery = useQuery({
    queryKey: ["relation-line-form", props.model, "form"],
    enabled: Boolean(client && props.model),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParsedView | null> => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, null, "form", {
            ...sessionContext,
            ...(props.context ?? {}),
          }),
        );
      } catch {
        return parseFieldsViewGet({
          arch: `<form><field name="name"/><field name="rec_name"/></form>`,
          fields: {
            name: { type: "char", string: "Name" },
            rec_name: { type: "char", string: "Name" },
          },
        });
      }
    },
  });

  const recordQuery = useQuery({
    queryKey: ["relation-line-form", props.model, props.lineId, viewQuery.dataUpdatedAt],
    enabled: Boolean(client && props.model && editing && viewQuery.data),
    queryFn: async () => {
      if (!client || props.lineId == null) return null;
      const fields = Object.keys(viewQuery.data?.fields ?? { rec_name: true, name: true });
      const rows = await client.searchRead(
        props.model,
        [["id", "=", props.lineId]],
        fields.length ? fields : ["id", "rec_name", "name"],
        0,
        1,
        null,
        rpcContext,
      );
      return (rows[0] as RecordValues) ?? null;
    },
  });

  useEffect(() => {
    if (editing) {
      if (recordQuery.data) setDraft(recordQuery.data);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (!client) {
        if (!cancelled) setDraft({});
        return;
      }
      const fieldNames = Object.keys(viewQuery.data?.fields ?? {});
      try {
        const defaults = await client.model(
          props.model,
          "default_get",
          [fieldNames.length ? fieldNames : ["name"]],
          { ...sessionContext, ...(props.context ?? {}) },
        );
        if (cancelled) return;
        setDraft(
          defaults && typeof defaults === "object" && !Array.isArray(defaults)
            ? (defaults as RecordValues)
            : {},
        );
      } catch {
        if (!cancelled) setDraft({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    editing,
    recordQuery.data,
    client,
    props.model,
    props.context,
    sessionContext,
    viewQuery.data?.fields,
  ]);

  const state =
    viewQuery.isLoading || (editing && recordQuery.isLoading)
      ? "loading"
      : viewQuery.isError
        ? "error"
        : "data";

  return (
    <Panel title={editing ? `Edit ${props.model} #${props.lineId}` : `New ${props.model} line`}>
      <StateBlock
        state={state}
        message={viewQuery.error instanceof Error ? viewQuery.error.message : "Loading…"}
      >
        {viewQuery.data
          ? renderView(viewQuery.data, {
              values: draft,
              mode: "write",
              density,
              model: props.model,
              onChange: (name, value) => setDraft((d) => ({ ...d, [name]: value })),
            })
          : null}
        <div className="epiton-toolbar">
          <Button
            variant="primary"
            onClick={() => {
              const { id: _id, ...values } = draft;
              props.onSave(values, props.lineId ?? null);
            }}
          >
            Queue {editing ? "write" : "create"}
          </Button>
          <Button onClick={props.onCancel}>Cancel</Button>
        </div>
      </StateBlock>
    </Panel>
  );
}
