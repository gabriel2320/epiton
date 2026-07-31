import type { JsonObject } from "@epiton/protocol";
import { applyFieldChange } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type ParsedView,
  type RecordValues,
  parseFieldsViewGet,
  renderView,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const [viewError, setViewError] = useState<string | null>(null);
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editing = props.lineId != null;

  const viewQuery = useQuery({
    queryKey: ["relation-line-form", props.model, "form"],
    enabled: Boolean(client && props.model),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParsedView | null> => {
      if (!client) return null;
      try {
        setViewError(null);
        return parseFieldsViewGet(
          await client.fieldsViewGet(props.model, null, "form", {
            ...sessionContext,
            ...(props.context ?? {}),
          }),
        );
      } catch (err) {
        setViewError(err instanceof Error ? err.message : "fields_view_get failed");
        return null;
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

  useEffect(() => {
    return () => {
      if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    };
  }, []);

  function handleChange(name: string, value: unknown) {
    setDraft((d) => ({ ...d, [name]: value }));
    if (!client || !viewQuery.data) return;
    if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    onChangeTimer.current = setTimeout(() => {
      void (async () => {
        if (!client || !viewQuery.data) return;
        const fieldsMeta: Record<
          string,
          { name: string; on_change?: string[]; on_change_with?: string[] }
        > = {};
        for (const [fname, field] of Object.entries(viewQuery.data.fields)) {
          fieldsMeta[fname] = {
            name: fname,
            on_change: field.on_change,
            on_change_with: field.on_change_with,
          };
        }
        try {
          const patch = await applyFieldChange(
            client,
            props.model,
            fieldsMeta,
            { ...draftRef.current, [name]: value },
            name,
            rpcContext,
          );
          if (!Object.keys(patch).length) return;
          setDraft((d) => ({ ...d, ...patch }));
        } catch {
          /* soft-fail */
        }
      })();
    }, 250);
  }

  const state =
    viewQuery.isLoading || (editing && recordQuery.isLoading)
      ? "loading"
      : viewQuery.isError || viewError
        ? "error"
        : viewQuery.data
          ? "data"
          : "empty";

  return (
    <Panel title={editing ? `Edit ${props.model} #${props.lineId}` : `New ${props.model} line`}>
      <StateBlock
        state={state}
        message={
          viewError ?? (viewQuery.error instanceof Error ? viewQuery.error.message : "Loading…")
        }
      >
        {viewQuery.data
          ? renderView(viewQuery.data, {
              values: draft,
              mode: "write",
              density,
              model: props.model,
              onChange: handleChange,
            })
          : null}
        <div className="epiton-toolbar">
          <Button
            variant="primary"
            disabled={!viewQuery.data}
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
