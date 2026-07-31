import { Button, Panel } from "@epiton/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";

type HistoryRow = Record<string, unknown>;

function displayValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return String(v[1] ?? v[0] ?? "");
  return String(v).slice(0, 120);
}

function sameValue(a: unknown, b: unknown): boolean {
  return displayValue(a) === displayValue(b);
}

function uidLabel(uid: unknown): string {
  if (uid == null) return "";
  if (Array.isArray(uid)) return String(uid[1] ?? uid[0] ?? "");
  return `uid ${String(uid)}`;
}

/** Peek at model.__history__ with field dump + optional restore into draft. */
export function RecordHistoryPanel(props: {
  model: string;
  recordId: number;
  fieldNames?: string[];
  /** Current form draft for changed-field highlighting. */
  currentValues?: Record<string, unknown>;
  onClose: () => void;
  onRestore?: (values: Record<string, unknown>) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [message, setMessage] = useState("Loading history…");
  const [busy, setBusy] = useState(false);
  const [userNames, setUserNames] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    const historyModel = `${props.model}.__history__`;
    const fields = [
      "id",
      "write_date",
      "write_uid",
      "create_date",
      "create_uid",
      ...(props.fieldNames ?? []).filter(
        (f) => !["id", "write_date", "write_uid", "create_date", "create_uid"].includes(f),
      ),
    ].slice(0, 40);
    try {
      const result = await client.searchRead(
        historyModel,
        [["id", "=", props.recordId]],
        fields,
        0,
        40,
        "write_date DESC",
        sessionContext,
      );
      setRows(result);
      setSelected(result[0] ?? null);
      setMessage(result.length ? `${result.length} revision(s)` : "No history rows");

      const uidSet = new Set<number>();
      for (const r of result) {
        for (const key of ["write_uid", "create_uid"] as const) {
          const raw = r[key];
          const id = Array.isArray(raw) ? Number(raw[0]) : Number(raw);
          if (Number.isFinite(id) && !(Array.isArray(raw) && raw[1])) uidSet.add(id);
        }
      }
      if (uidSet.size) {
        try {
          const users = await client.searchRead(
            "res.user",
            [["id", "in", [...uidSet]]],
            ["id", "name", "rec_name"],
            0,
            uidSet.size,
            null,
            sessionContext,
          );
          const next: Record<number, string> = {};
          for (const u of users) {
            const id = Number(u.id);
            if (Number.isFinite(id)) next[id] = String(u.rec_name ?? u.name ?? `#${id}`);
          }
          setUserNames(next);
        } catch {
          setUserNames({});
        }
      }
    } catch (err) {
      setRows([]);
      setSelected(null);
      setMessage(
        err instanceof Error
          ? `History unavailable (${err.message})`
          : "History unavailable for this model",
      );
    } finally {
      setBusy(false);
    }
  }, [client, props.model, props.recordId, props.fieldNames, sessionContext]);

  useEffect(() => {
    void load();
  }, [load]);

  const peekEntries = useMemo(() => {
    if (!selected) return [];
    return Object.entries(selected).filter(
      ([k]) => !["id", "write_uid", "create_uid", "create_date"].includes(k),
    );
  }, [selected]);

  function resolveUid(uid: unknown): string {
    if (Array.isArray(uid) && uid[1]) return String(uid[1]);
    const id = Array.isArray(uid) ? Number(uid[0]) : Number(uid);
    if (Number.isFinite(id) && userNames[id]) return userNames[id];
    return uidLabel(uid);
  }

  return (
    <Panel title={`History · ${props.model} #${props.recordId}`}>
      <div className="epiton-toolbar">
        <Button disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
        {selected && props.onRestore ? (
          <Button variant="primary" onClick={() => props.onRestore?.(selected)}>
            Load into form
          </Button>
        ) : null}
        <Button variant="ghost" onClick={props.onClose}>
          Close
        </Button>
      </div>
      <p role="status">{message}</p>
      <ul className="epiton-menu-list">
        {rows.map((r, i) => {
          const key = `${String(r.write_date ?? r.id)}-${i}`;
          const active = selected === r;
          const who = resolveUid(r.write_uid);
          return (
            <li key={key}>
              <button
                type="button"
                className={active ? "epiton-button" : "epiton-bus-open"}
                onClick={() => setSelected(r)}
              >
                {String(r.write_date ?? r.create_date ?? "—")}
                {who ? ` · ${who}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <dl className="epiton-history-peek" aria-label="Revision fields">
          {peekEntries.slice(0, 24).map(([k, v]) => {
            const current = props.currentValues?.[k];
            const changed =
              props.currentValues != null && k !== "write_date" && !sameValue(v, current);
            return (
              <div key={k} data-changed={changed || undefined}>
                <dt>
                  {k}
                  {changed ? " *" : ""}
                </dt>
                <dd>
                  {displayValue(v)}
                  {changed ? (
                    <span className="epiton-history-diff"> ← now {displayValue(current)}</span>
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
