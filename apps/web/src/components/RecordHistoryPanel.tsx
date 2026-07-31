import { Button, Panel } from "@epiton/ui";
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

type HistoryRow = Record<string, unknown>;

/** Read-only peek at model.__history__ when the server exposes it. */
export function RecordHistoryPanel(props: {
  model: string;
  recordId: number;
  onClose: () => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [message, setMessage] = useState("Loading history…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    const historyModel = `${props.model}.__history__`;
    try {
      const result = await client.searchRead(
        historyModel,
        [["id", "=", props.recordId]],
        ["id", "write_date", "write_uid", "create_date", "create_uid"],
        0,
        40,
        "write_date DESC",
        sessionContext,
      );
      setRows(result);
      setMessage(result.length ? `${result.length} revision(s)` : "No history rows");
    } catch (err) {
      setRows([]);
      setMessage(
        err instanceof Error
          ? `History unavailable (${err.message})`
          : "History unavailable for this model",
      );
    } finally {
      setBusy(false);
    }
  }, [client, props.model, props.recordId, sessionContext]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel title={`History · ${props.model} #${props.recordId}`}>
      <div className="epiton-toolbar">
        <Button disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
        <Button variant="ghost" onClick={props.onClose}>
          Close
        </Button>
      </div>
      <p role="status">{message}</p>
      <ul className="epiton-menu-list">
        {rows.map((r, i) => (
          <li key={`${String(r.write_date ?? r.id)}-${i}`}>
            <span>
              {String(r.write_date ?? r.create_date ?? "—")}
              {r.write_uid != null
                ? ` · uid ${Array.isArray(r.write_uid) ? r.write_uid[0] : String(r.write_uid)}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
