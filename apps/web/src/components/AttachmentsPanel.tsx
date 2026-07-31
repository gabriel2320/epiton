import { Button, Panel } from "@epiton/ui";
import { useState } from "react";
import { useAppStore } from "../lib/store";

/** Sao-parity: attachments via ir.attachment search_read. */
export function AttachmentsPanel(props: { model: string; recordId?: number }) {
  const client = useAppStore((s) => s.client);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");

  async function load() {
    if (!client) return;
    try {
      const domain: unknown[] = [["resource", "like", `${props.model},%`]];
      if (props.recordId) domain.push(["resource", "=", `${props.model},${props.recordId}`]);
      const result = await client.searchRead(
        "ir.attachment",
        domain as never,
        ["name", "resource", "type"],
        0,
        20,
      );
      setRows(result);
      setMessage(`${result.length} attachment(s)`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Attachments unavailable");
    }
  }

  return (
    <Panel title="Attachments">
      <Button onClick={load}>Load attachments</Button>
      <p role="status">{message}</p>
      <ul>
        {rows.map((r) => (
          <li key={String(r.id)}>{String(r.name ?? r.id)}</li>
        ))}
      </ul>
    </Panel>
  );
}
