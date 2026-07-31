import type { JsonObject } from "@epiton/protocol";
import { applyFieldChange } from "@epiton/protocol";
import { Button, StateBlock } from "@epiton/ui";
import { type RecordValues, parseFieldsViewGet, renderView } from "@epiton/view-engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store";

/** Compact in-pane form for board embedding (subset of ModelWorkspace form). */
export function RecordFormPane(props: {
  model: string;
  recordId: number;
  rpcContext: JsonObject;
  onSaved?: () => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RecordValues>({});
  const [mode, setMode] = useState<"read" | "write">("read");
  const [notice, setNotice] = useState<string | null>(null);
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewQuery = useQuery({
    queryKey: ["board-form-view", props.model],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      return parseFieldsViewGet(
        await client.fieldsViewGet(props.model, null, "form", props.rpcContext),
      );
    },
  });

  const recordQuery = useQuery({
    queryKey: ["board-form-record", props.model, props.recordId, viewQuery.dataUpdatedAt],
    enabled: Boolean(client && props.recordId && viewQuery.isSuccess),
    queryFn: async () => {
      if (!client) return null;
      const fieldNames = [
        ...new Set(["id", "rec_name", ...Object.keys(viewQuery.data?.fields ?? {})]),
      ];
      const result = await client.model(
        props.model,
        "read",
        [[props.recordId], fieldNames],
        props.rpcContext,
      );
      return Array.isArray(result) ? (result[0] as RecordValues) : null;
    },
  });

  useEffect(() => {
    if (recordQuery.data) setDraft(recordQuery.data);
  }, [recordQuery.data]);

  useEffect(() => {
    return () => {
      if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      const fields = viewQuery.data?.fields ?? {};
      const patch: JsonObject = {};
      for (const key of Object.keys(fields)) {
        if (!(key in draft) || key === "id") continue;
        const raw = draft[key];
        if (Array.isArray(raw) && typeof raw[0] === "number") patch[key] = raw[0];
        else if (raw !== undefined) patch[key] = raw as JsonObject[string];
      }
      await client.model(props.model, "write", [[props.recordId], patch], props.rpcContext);
    },
    onSuccess: async () => {
      setNotice("Saved");
      setMode("read");
      await queryClient.invalidateQueries({ queryKey: ["board-pane", "screen", props.model] });
      await queryClient.invalidateQueries({
        queryKey: ["board-form-record", props.model, props.recordId],
      });
      props.onSaved?.();
    },
    onError: (err) => {
      setNotice(err instanceof Error ? err.message : "Save failed");
    },
  });

  function handleFieldChange(name: string, value: unknown) {
    setDraft((d) => {
      const next = { ...d, [name]: value };
      if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
      onChangeTimer.current = setTimeout(() => {
        if (!client || !viewQuery.data?.fields) return;
        void applyFieldChange(
          client,
          props.model,
          viewQuery.data.fields,
          next,
          name,
          props.rpcContext,
        ).then((patch) => {
          if (Object.keys(patch).length) setDraft((cur) => ({ ...cur, ...patch }));
        });
      }, 280);
      return next;
    });
  }

  const state = viewQuery.isLoading || recordQuery.isLoading ? "loading" : "data";

  return (
    <div className="epiton-board-form">
      <StateBlock state={state} message="Loading form…">
        <div className="epiton-toolbar">
          <Button onClick={() => setMode(mode === "read" ? "write" : "read")}>Mode: {mode}</Button>
          <Button
            variant="primary"
            disabled={saveMutation.isPending || mode === "read"}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-[var(--epiton-muted)]">
            {notice}
          </p>
        ) : null}
        {viewQuery.data
          ? renderView(viewQuery.data, {
              values: draft,
              mode,
              density,
              model: props.model,
              onChange: handleFieldChange,
            })
          : null}
      </StateBlock>
    </div>
  );
}
