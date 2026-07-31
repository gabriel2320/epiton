import type { JsonObject } from "@epiton/protocol";
import { applyFieldChange } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type ParsedView,
  type RecordValues,
  type ViewField,
  parseFieldsViewGet,
  renderView,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store";
import { RelationLinesEditor } from "./RelationLinesEditor";
import { RelationSearch } from "./RelationSearch";

/** Embedded O2M line form: create or edit related values before queuing commands. */
export function RelationLineForm(props: {
  model: string;
  lineId?: number | null;
  context?: JsonObject;
  /** Seed draft for editing a queued create (no server id yet). */
  initialValues?: RecordValues;
  onCancel: () => void;
  onSave: (values: RecordValues, lineId: number | null) => void;
  onOpenRelated?: (model: string, id: number) => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const rpcContext: JsonObject = { ...sessionContext, ...(props.context ?? {}) };
  const [draft, setDraft] = useState<RecordValues>({});
  const [viewError, setViewError] = useState<string | null>(null);
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [relationDomain, setRelationDomain] = useState<unknown[] | undefined>(undefined);
  const [buttonNotice, setButtonNotice] = useState<string | null>(null);
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
    if (props.initialValues) {
      setDraft(props.initialValues);
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
    props.initialValues,
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

  async function runButton(name: string, meta?: { type?: string }) {
    if (!client) return;
    const buttonType = (meta?.type ?? "").toLowerCase();
    if (buttonType === "action") {
      setButtonNotice(`Action buttons open from the parent workspace (${name})`);
      return;
    }
    if (props.lineId == null) {
      setButtonNotice("Queue/save the line before running buttons");
      return;
    }
    setButtonNotice(`Running ${name}…`);
    try {
      await client.model(props.model, name, [[props.lineId]], {
        ...rpcContext,
        active_id: props.lineId,
        active_ids: [props.lineId],
        active_model: props.model,
      });
      setButtonNotice(`Button ${name} OK`);
      await recordQuery.refetch();
    } catch (err) {
      setButtonNotice(err instanceof Error ? err.message : "Button failed");
    }
  }

  const state =
    viewQuery.isLoading || (editing && recordQuery.isLoading)
      ? "loading"
      : viewQuery.isError || viewError
        ? "error"
        : viewQuery.data
          ? "data"
          : "empty";

  const nestedLines = relationField?.type === "one2many" || relationField?.type === "many2many";

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
              onButton: (name, meta) => void runButton(name, meta),
              onOpenRelation: (field, value, domain) => {
                setRelationField(field);
                setRelationDomain(domain);
                if (
                  field.type === "many2one" &&
                  field.relation &&
                  Array.isArray(value) &&
                  typeof value[0] === "number" &&
                  props.onOpenRelated
                ) {
                  props.onOpenRelated(field.relation, value[0]);
                }
              },
            })
          : null}
        {relationField?.type === "many2one" ? (
          <RelationSearch
            field={relationField}
            recordValues={draft}
            domain={relationDomain}
            mode="write"
            onCancel={() => {
              setRelationField(null);
              setRelationDomain(undefined);
            }}
            onPick={(id, recName) => {
              handleChange(relationField.name, [id, recName]);
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : null}
        {nestedLines && relationField ? (
          <RelationLinesEditor
            field={relationField}
            value={draft[relationField.name]}
            mode="write"
            recordValues={draft}
            domain={relationDomain}
            onOpenLine={props.onOpenRelated}
            onCommit={(next) => {
              handleChange(relationField.name, next);
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : null}
        {buttonNotice ? <p role="status">{buttonNotice}</p> : null}
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
