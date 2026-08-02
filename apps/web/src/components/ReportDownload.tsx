import { type JsonObject, executeReport } from "@epiton/protocol";
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
import { useTranslation } from "react-i18next";
import { backendRpcContextKey } from "../lib/backendTruth";
import { useAppStore } from "../lib/store";
import { GraphView } from "./GraphView";
import { PdfPreview } from "./PdfPreview";

type ReportRow = {
  id: number;
  name?: string;
  report_name?: string;
  model?: string;
};

function decodeBase64(payload: string): Uint8Array {
  try {
    const binary = atob(payload.replace(/\s/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function reportMimeType(extension: string): string {
  const types: Record<string, string> = {
    csv: "text/csv;charset=utf-8",
    html: "text/html;charset=utf-8",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    pdf: "application/pdf",
    txt: "text/plain;charset=utf-8",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return types[extension] ?? "application/octet-stream";
}

function reportDownloadName(filename: string, reportName: string, extension: string): string {
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "bin";
  const unsafeFilenameCharacters = '\\/:*?"<>|';
  const base = Array.from(filename.trim() || reportName)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 || unsafeFilenameCharacters.includes(character)
        ? "-"
        : character;
    })
    .join("")
    .replace(/[. ]+$/g, "")
    .trim();
  const safeBase = base || "report";
  return safeBase.toLowerCase().endsWith(`.${safeExtension}`)
    ? safeBase
    : `${safeBase}.${safeExtension}`;
}

/** Download / preview Tryton report payloads + optional visual analytics over the same ids. */
export function ReportDownload(props: {
  initialReport?: string | null;
  /** Invocation context from an action host such as a board pane. */
  initialContext?: JsonObject | null;
  initialIds?: string;
  /** Optional model for analytics companion (same records as report ids). */
  initialModel?: string | null;
}) {
  const { t } = useTranslation();
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [reportName, setReportName] = useState(props.initialReport ?? "");
  const [idsText, setIdsText] = useState(props.initialIds ?? "");
  const [modelName, setModelName] = useState(props.initialModel ?? "");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"accent" | "danger">("accent");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState("application/pdf");
  const [analyticsRows, setAnalyticsRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const executionContext = useMemo(
    () => ({ ...sessionContext, ...(props.initialContext ?? {}) }),
    [sessionContext, props.initialContext],
  );
  const sessionRpcScope = backendRpcContextKey(sessionContext);

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
    queryKey: ["ir.action.report", modelName, sessionRpcScope],
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
      setMessageTone("danger");
      setMessage(t("report.chooseBackend"));
      return;
    }
    if (!ids.length) {
      setMessageTone("danger");
      setMessage(t("report.needIds"));
      return;
    }
    try {
      const contextActionId = executionContext.action_id;
      const invokedReport = props.initialReport?.trim();
      const selectedAction = reportsQuery.data?.find(
        (report) =>
          report.report_name === reportName.trim() &&
          (!modelName.trim() || report.model === modelName.trim()),
      );
      const actionId =
        invokedReport === reportName.trim() &&
        typeof contextActionId === "number" &&
        Number.isSafeInteger(contextActionId) &&
        contextActionId > 0
          ? contextActionId
          : selectedAction?.id;
      const reportContext =
        actionId && actionId !== contextActionId
          ? { ...executionContext, action_id: actionId }
          : executionContext;
      const result = await executeReport(client, reportName, ids, {
        actionId,
        model: modelName,
        context: reportContext,
      });
      const bytes = decodeBase64(result.payloadBase64);
      if (!bytes.length) {
        throw new Error(t("report.invalidPayload"));
      }
      const payloadBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(payloadBuffer).set(bytes);
      const blob = new Blob([payloadBuffer], { type: reportMimeType(result.extension) });
      const url = URL.createObjectURL(blob);
      setMessageTone("accent");
      if (preview) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
        setPreviewMime(blob.type || "application/octet-stream");
        setMessage(t("report.previewBytes", { bytes: bytes.length, extension: result.extension }));
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reportDownloadName(result.filename, reportName, result.extension);
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(t("report.downloadedBytes", { bytes: bytes.length }));
    } catch (err) {
      setMessageTone("danger");
      setMessage(err instanceof Error ? err.message : t("report.notInstalled"));
    }
  }

  async function loadAnalytics() {
    if (!client || !ids.length || !modelName.trim()) {
      setAnalyticsError(t("report.needAnalyticsSelection"));
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
      if (!rows.length) setAnalyticsError(t("report.noAnalyticsRows"));
    } catch (err) {
      setAnalyticsRows(null);
      setAnalyticsError(err instanceof Error ? err.message : t("report.analyticsReadFailed"));
    }
  }

  const reports = reportsQuery.data ?? [];

  return (
    <Panel title={t("report.title")}>
      <div className="epiton-toolbar">
        <input
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          aria-label={t("report.name")}
          list="epiton-report-suggestions"
          placeholder={t("report.technicalName")}
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
            aria-label={t("report.pickRegistered")}
            value={reports.some((r) => r.report_name === reportName) ? reportName : ""}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              setReportName(next);
              const hit = reports.find((r) => r.report_name === next);
              if (hit?.model) setModelName(String(hit.model));
            }}
          >
            <option value="">{t("report.pick")}</option>
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
          aria-label={t("report.recordIds")}
          placeholder={t("report.idsPlaceholder")}
        />
        <Button onClick={() => void run(false)}>{t("report.download")}</Button>
        <Button onClick={() => void run(true)}>{t("report.preview")}</Button>
      </div>
      {reportsQuery.isError ? <Alert tone="muted">{t("report.listFailed")}</Alert> : null}
      {message ? <Alert tone={messageTone}>{message}</Alert> : null}
      {previewUrl ? (
        previewMime.includes("pdf") ? (
          <PdfPreview url={previewUrl} title={t("report.previewTitle")} />
        ) : (
          <iframe
            title={t("report.previewTitle")}
            src={previewUrl}
            sandbox=""
            className="epiton-report-preview"
            style={{ width: "100%", minHeight: "420px", border: "1px solid var(--epiton-border)" }}
          />
        )
      ) : null}

      <section
        className="epiton-report-analytics"
        aria-label={t("report.visualAnalyticsCompanion")}
      >
        <h3 className="epiton-report-analytics-title">{t("report.visualAnalytics")}</h3>
        <p className="epiton-board-hint" role="note">
          {t("report.visualAnalyticsHint")}
        </p>
        <div className="epiton-toolbar">
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            aria-label={t("report.analyticsModel")}
            placeholder="model.name"
          />
          <Button onClick={() => void loadAnalytics()}>{t("report.analyzeIds")}</Button>
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
