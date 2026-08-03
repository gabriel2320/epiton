import {
  type JsonObject,
  type JsonValue,
  buildSessionContext,
  reloadSessionPreferences,
} from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type RecordValues,
  type ViewField,
  hydrateRelationSelections,
  parseFieldsViewGet,
  relationSelectionRequests,
  renderView,
} from "@epiton/view-engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  backendRpcContextKey,
  backendSessionBoundaryChanged,
  discardBackendProjection,
} from "../lib/backendTruth";
import { useAppStore } from "../lib/store";
import { applyClientLanguage } from "../lib/translations";
import { RelationSearch } from "./RelationSearch";

function preferenceRpcValue(field: ViewField | undefined, value: unknown): JsonValue | undefined {
  if (field?.type === "many2one" && Array.isArray(value)) {
    const id = value[0];
    if (typeof id === "number" || typeof id === "string" || id === null) return id;
  }
  return value === undefined ? undefined : (value as JsonValue);
}

/** Preferences form from Tryton's native res.user preferences view contract. */
export function PreferencesPanel(props: { onSessionBoundary?: () => void }) {
  const { t } = useTranslation();
  const client = useAppStore((s) => s.client);
  const session = useAppStore((s) => s.session);
  const preferences = useAppStore((s) => s.preferences);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const density = useAppStore((s) => s.density);
  const setPreferences = useAppStore((s) => s.setPreferences);
  const queryClient = useQueryClient();
  const sessionRpcScope = backendRpcContextKey(sessionContext);

  const [draft, setDraft] = useState<RecordValues>({ ...preferences });
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "data">("idle");
  const [message, setMessage] = useState(() => t("preferences.loadPrompt"));
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  const viewQuery = useQuery({
    queryKey: ["res.user", "preferences-view", sessionRpcScope],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        setViewError(null);
        return parseFieldsViewGet(
          (await client.model(
            "res.user",
            "get_preferences_fields_view",
            [],
            sessionContext,
          )) as JsonObject,
        );
      } catch (err) {
        setViewError(err instanceof Error ? err.message : t("preferences.viewFailed"));
        return null;
      }
    },
  });

  useEffect(() => {
    setDraft({ ...preferences });
  }, [preferences]);

  const selectionRequests = viewQuery.data ? relationSelectionRequests(viewQuery.data, draft) : [];
  const selectionScope = JSON.stringify(selectionRequests);
  const selectionQuery = useQuery({
    queryKey: [
      "res.user",
      "preference-relation-selections",
      sessionRpcScope,
      viewQuery.dataUpdatedAt,
      selectionScope,
    ],
    enabled: Boolean(client && viewQuery.data && selectionRequests.length),
    queryFn: async () => {
      if (!client || !viewQuery.data) return null;
      return hydrateRelationSelections(viewQuery.data, draft, async (request) =>
        client.searchRead(
          request.relation,
          request.domain as JsonValue[],
          ["rec_name"],
          0,
          null,
          null,
          { ...sessionContext, ...request.context } as JsonObject,
        ),
      );
    },
  });
  const renderedView = selectionRequests.length ? selectionQuery.data : viewQuery.data;
  const resolvedViewError =
    viewError ??
    (selectionQuery.error instanceof Error
      ? selectionQuery.error.message
      : selectionQuery.isError
        ? t("preferences.viewFailed")
        : null);

  async function save() {
    if (!client || !session) return;
    setStatus("loading");
    setMessage(t("preferences.saving"));
    const patch: JsonObject = {};
    const fields = renderedView?.fields ?? viewQuery.data?.fields ?? {};
    const keys = Object.keys(fields).length
      ? Object.keys(fields)
      : ["company", "language", "employee"];
    for (const key of keys) {
      if (!(key in draft)) continue;
      const field = fields[key];
      const current = preferenceRpcValue(field, draft[key]);
      const persisted = preferenceRpcValue(field, preferences[key]);
      if (JSON.stringify(current) === JSON.stringify(persisted) || current === undefined) continue;
      patch[key] = current;
    }
    if (!Object.keys(patch).length) {
      setStatus("data");
      setMessage(t("preferences.saved"));
      return;
    }
    const requestedContext = buildSessionContext(
      { ...preferences, ...patch },
      { ...sessionContext, ...patch, user: session.userId },
    );
    if (
      backendSessionBoundaryChanged(sessionContext, requestedContext) &&
      !globalThis.confirm(t("preferences.sessionBoundaryConfirm"))
    ) {
      setStatus("idle");
      setMessage(t("preferences.cancelled"));
      return;
    }
    try {
      const next = await reloadSessionPreferences(client, session.userId, patch);
      if (backendSessionBoundaryChanged(sessionContext, next.sessionContext)) {
        discardBackendProjection(queryClient);
        props.onSessionBoundary?.();
      }
      setPreferences(next.preferences, next.sessionContext);
      setDraft({ ...next.preferences });
      const lang =
        typeof next.preferences.language === "string"
          ? next.preferences.language
          : Array.isArray(next.preferences.language)
            ? String(next.preferences.language[0] ?? "")
            : "";
      if (lang) await applyClientLanguage(client, lang);
      setStatus("data");
      setMessage(t("preferences.saved"));
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : t("preferences.saveFailed"));
    }
  }

  async function reload() {
    if (!client || !session) return;
    setStatus("loading");
    try {
      const next = await reloadSessionPreferences(client, session.userId);
      if (backendSessionBoundaryChanged(sessionContext, next.sessionContext)) {
        discardBackendProjection(queryClient);
        props.onSessionBoundary?.();
      }
      setPreferences(next.preferences, next.sessionContext);
      setDraft({ ...next.preferences });
      setStatus("data");
      setMessage(t("preferences.reloaded"));
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : t("preferences.reloadFailed"));
    }
  }

  const blockState =
    status === "idle"
      ? viewQuery.isLoading || (selectionRequests.length > 0 && selectionQuery.isLoading)
        ? "loading"
        : resolvedViewError
          ? "error"
          : renderedView
            ? "data"
            : "empty"
      : status;

  return (
    <Panel title={t("preferences.title")}>
      <StateBlock state={blockState} message={resolvedViewError ?? message}>
        {renderedView ? (
          renderView(renderedView, {
            values: draft,
            mode: "write",
            density,
            model: "res.user",
            onChange: (name, value) => setDraft((d) => ({ ...d, [name]: value })),
            onOpenRelation: (field) => setRelationField(field),
          })
        ) : (
          <p className="text-sm text-[var(--epiton-muted)]" role="status">
            {resolvedViewError ? t("preferences.formUnavailable") : t("preferences.waiting")}
          </p>
        )}
        {relationField ? (
          <RelationSearch
            field={relationField}
            recordValues={draft}
            context={sessionContext}
            mode="write"
            onCancel={() => setRelationField(null)}
            onPick={(id, recName) => {
              setDraft((d) => ({ ...d, [relationField.name]: [id, recName] }));
              setRelationField(null);
            }}
          />
        ) : null}
        <div className="epiton-toolbar">
          <Button variant="primary" disabled={status === "loading"} onClick={() => void save()}>
            {t("preferences.save")}
          </Button>
          <Button disabled={status === "loading"} onClick={() => void reload()}>
            {t("preferences.reload")}
          </Button>
        </div>
        <p className="text-sm text-[var(--epiton-muted)]">
          {t("preferences.contextKeys")}:{" "}
          {Object.keys(buildSessionContext(preferences)).slice(0, 8).join(", ") || "—"}
        </p>
      </StateBlock>
    </Panel>
  );
}
