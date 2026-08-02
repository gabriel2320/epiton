import type { JsonObject } from "@epiton/protocol";
import { Alert, Button, Panel } from "@epiton/ui";
import {
  aggregateGraphData,
  inferGraphFields,
  labelFieldCandidate,
  numericFieldCandidates,
  summarizeSeries,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import { GraphView } from "./GraphView";
import { PdfPreview } from "./PdfPreview";

type ReportRow = {
  id: number;
  name?: string;
  report_name?: string;
  model?: string;
};

/** Download / preview Tryton report payloads + optional visual analytics over the same ids. */
export function ReportDownload(props: {
  initialReport?: string | null;
  /** Invocation context from an action host such as a board pane. */
  initialContext?: JsonObject | null;
  initialIds?: string;
  /** Optional model for analytics companion (same records as report ids). */
  initialModel?: string | null;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [reportName, setReportName] = useState(props.initialReport ?? "");
  const [idsText, setIdsText] = useState(props.initialIds ?? "");
  const [modelName, setModelName] = useState(props.initialModel ?? "");
  const [format, setFormat] = useState<"pdf" | "odt" | "csv" | "xls" | "html">("pdf");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState("application/pdf");
  const [analyticsRows, setAnalyticsRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const executionContext = useMemo(
    () => ({ ...sessionContext, ...(props.initialContext ?? {}) }),
    [sessionContext, props.initialContext],
  );

  useEffect(() => {
    if (props.initialReport) setReportName(props.initialReport);
  }, [props.initialReport]);

  useEffect(() => {
    if (props.initialIds != null) setIdsText(props.initialIds);
  }, [props.initialIds]);

  useEffect(() => {
    if (props.initialModel) setModelName(props.initialModel);
  }, [props.initialModel]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reportsQuery = useQuery({
    queryKey: ["ir.action.report", modelName],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReportRow[]> => {
      if (!client) return [];
      const model = modelName.trim();
      const domain = model ? [["model", "=", model]] : [];
      let rows = (await client.searchRead(
        "ir.action.report",
        domain,
        ["id", "name", "report_name", "model"],
        0,
        200,
        "name ASC",
        sessionContext,
      )) as ReportRow[];
      if (!rows.length && model) {
        rows = (await client.searchRead(
          "ir.action.report",
          [],
          ["id", "name", "report_name", "model"],
          0,
          200,
          "name ASC",
          sessionContext,
        )) as ReportRow[];
      }
      return rows.filter((r) => typeof r.report_name === "string" && r.report_name.length > 0);
    },
  });

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
    if (!reportName.trim()) {
      setMessage("Choose a report supplied by the backend");
      return;
    }
    if (!ids.length) {
      setMessage("Enter at least one record id (select a record in the workspace)");
      return;
    }
    try {
      const result = await client.call(`report.${reportName}.execute`, [
        [ids, null, format, executionContext],
      ]);
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

  const reports = reportsQuery.data ?? [];

  return (
    <Panel title="Reports">
      <div className="epiton-toolbar">
        <input
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          aria-label="Report name"
          list="epiton-report-suggestions"
          placeholder="report technical name"
          style={{ minWidth: "14rem" }}
        />
        <datalist id="epiton-report-suggestions">
          {reports.map((r) => (
            <option
              key={r.id}
              value={String(r.report_name)}
              label={`${r.name ?? r.report_name}${r.model ? ` · ${r.model}` : ""}`}
            />
          ))}
        </datalist>
        {reports.length ? (
          <select
            aria-label="Pick registered report"
            value={reports.some((r) => r.report_name === reportName) ? reportName : ""}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              setReportName(next);
              const hit = reports.find((r) => r.report_name === next);
              if (hit?.model) setModelName(String(hit.model));
            }}
          >
            <option value="">Pick report…</option>
            {reports.map((r) => (
              <option key={r.id} value={String(r.report_name)}>
                {r.name ?? r.report_name}
                {r.model ? ` (${r.model})` : ""}
              </option>
            ))}
          </select>
        ) : null}
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
      {reportsQuery.isError ? (
        <Alert tone="muted">Could not list ir.action.report — type the technical name</Alert>
      ) : null}
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
