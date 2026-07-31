import { Button, Panel } from "@epiton/ui";
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

/** Sao-parity: attachments via ir.attachment search_read for the active record. */
export function AttachmentsPanel(props: { model: string; recordId?: number }) {
  const client = useAppStore((s) => s.client);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const domain: unknown[] =
        props.recordId != null
          ? [["resource", "=", `${props.model},${props.recordId}`]]
          : [["resource", "like", `${props.model},%`]];
      const result = await client.searchRead(
        "ir.attachment",
        domain as never,
        ["name", "resource", "type"],
        0,
        20,
      );
      setRows(result);
      setMessage(
        props.recordId != null
          ? `${result.length} attachment(s) for #${props.recordId}`
          : `${result.length} attachment(s)`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Attachments unavailable");
    }
  }, [client, props.model, props.recordId]);

  useEffect(() => {
    if (props.recordId != null) void load();
  }, [props.recordId, load]);

  return (
    <Panel title="Attachments">
      {!props.recordId ? (
        <p role="status" style={{ color: "var(--epiton-muted)" }}>
          Select a record to scope attachments, or load all for this model.
        </p>
      ) : null}
      <Button onClick={() => void load()}>Load attachments</Button>
      <p role="status">{message}</p>
      <ul>
        {rows.map((r) => (
          <li key={String(r.id)}>{String(r.name ?? r.id)}</li>
        ))}
      </ul>
    </Panel>
  );
}
