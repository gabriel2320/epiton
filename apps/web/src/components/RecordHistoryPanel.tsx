import { Button, Panel } from "@epiton/ui";
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

type HistoryRow = Record<string, unknown>;

/** Peek at model.__history__ with field dump + optional restore into draft. */
export function RecordHistoryPanel(props: {
  model: string;
  recordId: number;
  fieldNames?: string[];
  onClose: () => void;
  onRestore?: (values: Record<string, unknown>) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [message, setMessage] = useState("Loading history…");
  const [busy, setBusy] = useState(false);

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

  const peekEntries = selected
    ? Object.entries(selected).filter(
        ([k]) => !["write_uid", "create_uid", "create_date"].includes(k),
      )
    : [];

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
          return (
            <li key={key}>
              <button
                type="button"
                className={active ? "epiton-button" : "epiton-bus-open"}
                onClick={() => setSelected(r)}
              >
                {String(r.write_date ?? r.create_date ?? "—")}
                {r.write_uid != null
                  ? ` · uid ${Array.isArray(r.write_uid) ? r.write_uid[0] : String(r.write_uid)}`
                  : ""}
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <dl className="epiton-history-peek" aria-label="Revision fields">
          {peekEntries.slice(0, 24).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {Array.isArray(v)
                  ? String(v[1] ?? v[0] ?? "")
                  : v == null
                    ? "—"
                    : String(v).slice(0, 120)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Panel>
  );
}
