import { Button, Panel } from "@epiton/ui";
import { useState } from "react";
import { useAppStore } from "../lib/store";

/** Sao-parity: report download via report.* RPC when available. */
export function ReportDownload() {
  const client = useAppStore((s) => s.client);
  const [message, setMessage] = useState("");

  async function run() {
    if (!client) return;
    try {
      const result = await client.call("report.party.label.execute", [[[], null, "pdf", {}]]);
      setMessage(
        Array.isArray(result) ? `Report payload keys/length: ${result.length}` : "Report executed",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Report not installed");
    }
  }

  return (
    <Panel title="Reports">
      <Button onClick={run}>Probe party label report</Button>
      <p role="status">{message}</p>
    </Panel>
  );
}
