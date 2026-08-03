import type { JsonObject } from "@epiton/protocol";
import { Button, Panel } from "@epiton/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../lib/store";
import {
  formatHistoryMoment,
  listRecordHistory,
  type RecordHistoryRevision,
  readRecordHistorySnapshot,
} from "./modelWorkspace/recordHistory";

function displayValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  if (typeof value === "object") return JSON.stringify(value).slice(0, 120);
  return String(value).slice(0, 120);
}

function sameValue(a: unknown, b: unknown): boolean {
  return displayValue(a) === displayValue(b);
}

/** Browse native Tryton revisions and optionally load one into an unsaved draft. */
export function RecordHistoryPanel(props: {
  model: string;
  recordId: number;
  fieldNames?: string[];
  currentValues?: Record<string, unknown>;
  onClose: () => void;
  onRestore?: (values: Record<string, unknown>) => void;
}) {
  const client = useAppStore((state) => state.client);
  const sessionContext = useAppStore((state) => state.sessionContext);
  const { t } = useTranslation();
  const [revisions, setRevisions] = useState<RecordHistoryRevision[]>([]);
  const [selected, setSelected] = useState<RecordHistoryRevision | null>(null);
  const [snapshot, setSnapshot] = useState<JsonObject | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const fieldSignature = (props.fieldNames ?? []).join("\u0000");
  const historyFields = useMemo(
    () => (fieldSignature ? fieldSignature.split("\u0000") : []),
    [fieldSignature],
  );

  const load = useCallback(async () => {
    if (!client) return;
    setListBusy(true);
    setListError(null);
    setSnapshot(null);
    try {
      const result = await listRecordHistory(client, props.model, props.recordId, sessionContext);
      setRevisions(result);
      setSelected(result[0] ?? null);
    } catch (error) {
      setRevisions([]);
      setSelected(null);
      setListError(error instanceof Error ? error.message : t("history.unavailable"));
    } finally {
      setListBusy(false);
    }
  }, [client, props.model, props.recordId, sessionContext, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!client || !selected) {
      setSnapshot(null);
      return;
    }
    let active = true;
    setSnapshot(null);
    setSnapshotError(null);
    setSnapshotBusy(true);
    void readRecordHistorySnapshot(client, props.model, selected, historyFields, sessionContext)
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((error) => {
        if (active) {
          setSnapshotError(
            error instanceof Error ? error.message : t("history.snapshotUnavailable"),
          );
        }
      })
      .finally(() => {
        if (active) setSnapshotBusy(false);
      });
    return () => {
      active = false;
    };
  }, [client, historyFields, props.model, selected, sessionContext, t]);

  const peekEntries = useMemo(
    () =>
      snapshot
        ? Object.entries(snapshot).filter(
            ([key]) => !["id", "write_uid", "create_uid", "create_date"].includes(key),
          )
        : [],
    [snapshot],
  );

  const status = listBusy
    ? t("history.loading")
    : listError
      ? t("history.unavailableDetail", { detail: listError })
      : revisions.length
        ? t("history.count", { count: revisions.length })
        : t("history.none");

  return (
    <Panel title={t("history.title", { model: props.model, id: props.recordId })}>
      <div className="epiton-toolbar">
        <Button disabled={listBusy} onClick={() => void load()}>
          {t("history.refresh")}
        </Button>
        {snapshot && props.onRestore ? (
          <Button variant="primary" onClick={() => props.onRestore?.(snapshot)}>
            {t("history.loadDraft")}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={props.onClose}>
          {t("history.close")}
        </Button>
      </div>
      <p role="status">{status}</p>
      <ul className="epiton-menu-list">
        {revisions.map((revision) => {
          const active = selected?.key === revision.key;
          return (
            <li key={revision.key}>
              <button
                type="button"
                className={active ? "epiton-button" : "epiton-bus-open"}
                aria-pressed={active}
                onClick={() => setSelected(revision)}
              >
                {formatHistoryMoment(revision.at)}
                {revision.user ? ` · ${revision.user}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
      {snapshotBusy ? <p>{t("history.loadingSnapshot")}</p> : null}
      {snapshotError ? <p role="alert">{t("history.snapshotUnavailable")}</p> : null}
      {snapshot ? (
        <dl className="epiton-history-peek" aria-label={t("history.revisionFields")}>
          {peekEntries.slice(0, 24).map(([key, value]) => {
            const current = props.currentValues?.[key];
            const changed =
              props.currentValues != null && key !== "write_date" && !sameValue(value, current);
            return (
              <div key={key} data-changed={changed || undefined}>
                <dt>
                  {key}
                  {changed ? " *" : ""}
                </dt>
                <dd>
                  {displayValue(value)}
                  {changed ? (
                    <span className="epiton-history-diff">
                      {t("history.currentValue", { value: displayValue(current) })}
                    </span>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </Panel>
  );
}
