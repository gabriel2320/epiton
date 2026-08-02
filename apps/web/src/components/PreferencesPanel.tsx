import { type JsonObject, buildSessionContext, reloadSessionPreferences } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type RecordValues,
  type ViewField,
  parseFieldsViewGet,
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

/** Preferences form from res.user fields_view_get (preferences context). */
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
          await client.fieldsViewGet("res.user", null, "form", {
            ...sessionContext,
            preferences: true,
          }),
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

  async function save() {
    if (!client || !session) return;
    setStatus("loading");
    setMessage(t("preferences.saving"));
    const patch: JsonObject = {};
    const fields = viewQuery.data?.fields ?? {};
    const keys = Object.keys(fields).length
      ? Object.keys(fields)
      : ["company", "language", "employee"];
    for (const key of keys) {
      if (!(key in draft)) continue;
      const raw = draft[key];
      if (Array.isArray(raw) && typeof raw[0] === "number") {
        patch[key] = raw[0];
      } else if (raw !== undefined) {
        patch[key] = raw as JsonObject[string];
      }
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
      ? viewQuery.isLoading
        ? "loading"
        : viewError
          ? "error"
          : viewQuery.data
            ? "data"
            : "empty"
      : status;

  return (
    <Panel title={t("preferences.title")}>
      <StateBlock state={blockState} message={viewError ?? message}>
        {viewQuery.data ? (
          renderView(viewQuery.data, {
            values: draft,
            mode: "write",
            density,
            model: "res.user",
            onChange: (name, value) => setDraft((d) => ({ ...d, [name]: value })),
            onOpenRelation: (field) => setRelationField(field),
          })
        ) : (
          <p className="text-sm text-[var(--epiton-muted)]" role="status">
            {viewError ? t("preferences.formUnavailable") : t("preferences.waiting")}
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
