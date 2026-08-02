import type { EpitonClient, JsonObject, JsonValue } from "./index";

export interface ReportExecutionOptions {
  actionId?: number | null;
  model?: string | null;
  context?: JsonObject;
}

export interface ReportExecutionResult {
  extension: string;
  payloadBase64: string;
  directPrint: boolean;
  filename: string;
}

const REPORT_TECHNICAL_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function reportPayloadBase64(value: JsonValue): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value.__class__ === "bytes" && typeof value.base64 === "string" ? value.base64 : null;
}

/** Execute a Tryton report using the native `Report.execute(ids, data, context)` RPC contract. */
export async function executeReport(
  client: EpitonClient,
  reportName: string,
  ids: number[],
  options: ReportExecutionOptions = {},
): Promise<ReportExecutionResult> {
  const technicalName = reportName.trim();
  if (!technicalName) throw new Error("A report technical name is required");
  if (!REPORT_TECHNICAL_NAME.test(technicalName)) {
    throw new Error("The report technical name is invalid");
  }
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("At least one valid report record id is required");
  }

  const data: JsonObject = {};
  if (
    typeof options.actionId === "number" &&
    Number.isSafeInteger(options.actionId) &&
    options.actionId > 0
  ) {
    data.action_id = options.actionId;
  }
  const model = options.model?.trim();
  if (model) data.model = model;

  const result = await client.call(`report.${technicalName}.execute`, [
    ids,
    data,
    options.context ?? {},
  ]);
  if (!Array.isArray(result) || result.length < 4) {
    throw new Error(`report.${technicalName}.execute returned an unexpected payload`);
  }

  const extension = result[0];
  const payloadBase64 = reportPayloadBase64(result[1] ?? null);
  const directPrint = result[2];
  const filename = result[3];
  if (
    typeof extension !== "string" ||
    !extension.trim() ||
    payloadBase64 === null ||
    typeof directPrint !== "boolean" ||
    typeof filename !== "string"
  ) {
    throw new Error(`report.${technicalName}.execute returned invalid report parts`);
  }

  return {
    extension: extension.trim().toLowerCase(),
    payloadBase64,
    directPrint,
    filename,
  };
}
