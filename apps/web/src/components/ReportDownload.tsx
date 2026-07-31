import { Button, Panel } from "@epiton/ui";
import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

/** Download / preview Tryton report payloads ([type, data, ...] tuples). */
export function ReportDownload(props: {
  initialReport?: string | null;
  initialIds?: string;
}) {
  const client = useAppStore((s) => s.client);
  const [reportName, setReportName] = useState(props.initialReport ?? "party.label");
  const [idsText, setIdsText] = useState(props.initialIds ?? "1");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (props.initialReport) setReportName(props.initialReport);
  }, [props.initialReport]);

  useEffect(() => {
    if (props.initialIds) setIdsText(props.initialIds);
  }, [props.initialIds]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function run(preview: boolean) {
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
          if (preview) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(url);
            setMessage(`Preview ${bytes.length} bytes`);
            // Lazy-load pdf.js only when previewing
            void import("pdfjs-dist").then(() => {
              /* pdfjs available for future canvas render; iframe is enough for MVP */
            });
            return;
          }
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
        <Button onClick={() => void run(false)}>Download</Button>
        <Button onClick={() => void run(true)}>Preview</Button>
      </div>
      <p role="status">{message}</p>
      {previewUrl ? (
        <iframe
          title="Report preview"
          src={previewUrl}
          className="epiton-report-preview"
          style={{ width: "100%", minHeight: "420px", border: "1px solid var(--epiton-border)" }}
        />
      ) : null}
    </Panel>
  );
}
