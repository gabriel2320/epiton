import { Button, Panel } from "@epiton/ui";
import { useState } from "react";
import { useAppStore } from "../lib/store";

/** Download Tryton report payloads when the server returns [type, data, ...] tuples. */
export function ReportDownload() {
  const client = useAppStore((s) => s.client);
  const [reportName, setReportName] = useState("party.label");
  const [idsText, setIdsText] = useState("1");
  const [message, setMessage] = useState("");

  async function run() {
    if (!client) return;
    try {
      const ids = idsText
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      const result = await client.call(`report.${reportName}.execute`, [[ids, null, "pdf", {}]]);
      if (Array.isArray(result) && result.length >= 2) {
        const mime = String(result[0] ?? "application/pdf");
        const payload = result[1];
        const bytes =
          typeof payload === "string"
            ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
            : new Uint8Array();
        if (bytes.length) {
          const blob = new Blob([bytes], { type: mime.includes("/") ? mime : "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${reportName}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          setMessage(`Downloaded ${bytes.length} bytes`);
          return;
        }
      }
      setMessage(
        Array.isArray(result) ? `Report returned ${result.length} parts` : "Report executed",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Report not installed");
    }
  }

  return (
    <Panel title="Reports">
      <div className="epiton-toolbar">
        <input
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          aria-label="Report name"
        />
        <input
          value={idsText}
          onChange={(e) => setIdsText(e.target.value)}
          aria-label="Record ids"
          placeholder="ids comma-separated"
        />
        <Button onClick={run}>Execute / download</Button>
      </div>
      <p role="status">{message}</p>
    </Panel>
  );
}
