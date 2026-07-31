import { Alert, Button, Panel } from "@epiton/ui";
import {
  aggregateGraphData,
  inferGraphFields,
  labelFieldCandidate,
  numericFieldCandidates,
  summarizeSeries,
} from "@epiton/view-engine";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import { GraphView } from "./GraphView";
import { PdfPreview } from "./PdfPreview";

/** Download / preview Tryton report payloads + optional visual analytics over the same ids. */
export function ReportDownload(props: {
  initialReport?: string | null;
  initialIds?: string;
  /** Optional model for analytics companion (same records as report ids). */
  initialModel?: string | null;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [reportName, setReportName] = useState(props.initialReport ?? "party.label");
  const [idsText, setIdsText] = useState(props.initialIds ?? "1");
  const [modelName, setModelName] = useState(props.initialModel ?? "party.party");
  const [format, setFormat] = useState<"pdf" | "odt" | "csv" | "xls" | "html">("pdf");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState("application/pdf");
  const [analyticsRows, setAnalyticsRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (props.initialReport) setReportName(props.initialReport);
  }, [props.initialReport]);

  useEffect(() => {
    if (props.initialIds) setIdsText(props.initialIds);
  }, [props.initialIds]);

  useEffect(() => {
    if (props.initialModel) setModelName(props.initialModel);
  }, [props.initialModel]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const ids = useMemo(
    () =>
      idsText
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    [idsText],
  );

  const chart = useMemo(() => {
    if (!analyticsRows?.length) return null;
    const xField = labelFieldCandidate(analyticsRows);
    const nums = numericFieldCandidates(analyticsRows);
    const yField = nums[0] ?? inferGraphFields(Object.keys(analyticsRows[0]!)).yField;
    const data = aggregateGraphData(analyticsRows, xField, yField);
    return { data, yField, insight: summarizeSeries(data), chartType: "vbar" as const };
  }, [analyticsRows]);

  async function run(preview: boolean) {
    if (!client) return;
    try {
      const result = await client.call(`report.${reportName}.execute`, [[ids, null, format, {}]]);
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
            setPreviewMime(blob.type || "application/pdf");
            setMessage(`Preview ${bytes.length} bytes (${format})`);
            return;
          }
          const a = document.createElement("a");
          a.href = url;
          a.download = `${reportName}.${format === "pdf" ? "pdf" : format}`;
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

  async function loadAnalytics() {
    if (!client || !ids.length || !modelName.trim()) {
      setAnalyticsError("Need model + ids for analytics");
      return;
    }
    setAnalyticsError(null);
    try {
      const rows = (await client.searchRead(
        modelName.trim(),
        [["id", "in", ids]],
        [],
        0,
        200,
        null,
        sessionContext as never,
      )) as Array<Record<string, unknown>>;
      setAnalyticsRows(rows);
      if (!rows.length) setAnalyticsError("No rows returned for these ids");
    } catch (err) {
      setAnalyticsRows(null);
      setAnalyticsError(err instanceof Error ? err.message : "Analytics read failed");
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
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as "pdf" | "odt" | "csv" | "xls" | "html")}
          aria-label="Report format"
        >
          <option value="pdf">pdf</option>
          <option value="odt">odt</option>
          <option value="csv">csv</option>
          <option value="xls">xls</option>
          <option value="html">html</option>
        </select>
        <Button onClick={() => void run(false)}>Download</Button>
        <Button onClick={() => void run(true)}>Preview</Button>
      </div>
      {message ? (
        <Alert tone={/fail|error|not installed/i.test(message) ? "danger" : "accent"}>
          {message}
        </Alert>
      ) : null}
      {previewUrl ? (
        previewMime.includes("pdf") || format === "pdf" ? (
          <PdfPreview url={previewUrl} title="Report preview" />
        ) : (
          <iframe
            title="Report preview"
            src={previewUrl}
            className="epiton-report-preview"
            style={{ width: "100%", minHeight: "420px", border: "1px solid var(--epiton-border)" }}
          />
        )
      ) : null}

      <section className="epiton-report-analytics" aria-label="Visual analytics companion">
        <h3 className="epiton-report-analytics-title">Visual analytics</h3>
        <p className="epiton-board-hint" role="note">
          Complements the static Tryton report with interactive charts over the same record ids
          (`search_read`). Does not replace `report.*.execute`.
        </p>
        <div className="epiton-toolbar">
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            aria-label="Analytics model"
            placeholder="model.name"
          />
          <Button onClick={() => void loadAnalytics()}>Analyze ids</Button>
        </div>
        {analyticsError ? <Alert tone="danger">{analyticsError}</Alert> : null}
        {chart ? (
          <GraphView
            data={chart.data}
            chartType={chart.chartType}
            yLabel={chart.yField}
            height={280}
            insight={chart.insight}
          />
        ) : null}
      </section>
    </Panel>
  );
}
