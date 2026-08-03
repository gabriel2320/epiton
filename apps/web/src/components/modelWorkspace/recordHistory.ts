import type { JsonObject, JsonValue } from "@epiton/protocol";

export interface RecordHistoryClient {
  model(
    model: string,
    method: string,
    params?: JsonValue[],
    context?: JsonObject,
  ): Promise<JsonValue>;
}

export interface RecordHistoryRevision {
  at: JsonValue;
  key: string;
  recordId: number;
  user: string;
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHistoryMoment(value: JsonValue): boolean {
  if (typeof value === "string") return value.length > 0;
  return isObject(value) && value.__class__ === "datetime";
}

function revisionKey(at: JsonValue, recordId: number, index: number): string {
  return `${recordId}:${JSON.stringify(at)}:${index}`;
}

/** List native Tryton revisions. History tables are not RPC models. */
export async function listRecordHistory(
  client: RecordHistoryClient,
  model: string,
  recordId: number,
  context: JsonObject,
  limit = 40,
): Promise<RecordHistoryRevision[]> {
  const result = await client.model(model, "history_revisions", [[recordId]], context);
  if (!Array.isArray(result)) throw new Error("history_revisions expected an array");

  return result.slice(0, limit).map((row, index) => {
    const [at, revisionRecordId, revisionUser] = Array.isArray(row) ? row : [];
    if (
      !Array.isArray(row) ||
      row.length < 3 ||
      at === undefined ||
      !isHistoryMoment(at) ||
      typeof revisionRecordId !== "number" ||
      !Number.isSafeInteger(revisionRecordId) ||
      revisionRecordId <= 0 ||
      (revisionUser !== null && typeof revisionUser !== "string")
    ) {
      throw new Error("history_revisions returned an invalid revision");
    }
    return {
      at,
      key: revisionKey(at, revisionRecordId, index),
      recordId: revisionRecordId,
      user: revisionUser ?? "",
    };
  });
}

/** Read one immutable snapshot through Tryton's temporal `_datetime` context. */
export async function readRecordHistorySnapshot(
  client: RecordHistoryClient,
  model: string,
  revision: RecordHistoryRevision,
  fieldNames: string[],
  context: JsonObject,
): Promise<JsonObject> {
  const fields = [
    "id",
    ...fieldNames.filter(
      (field, index) =>
        field !== "id" && !field.startsWith("_") && fieldNames.indexOf(field) === index,
    ),
  ].slice(0, 40);
  const result = await client.model(model, "read", [[revision.recordId], fields], {
    ...context,
    _datetime: revision.at,
  });
  const snapshot = Array.isArray(result) ? result[0] : undefined;
  if (!Array.isArray(result) || result.length !== 1 || !snapshot || !isObject(snapshot)) {
    throw new Error("historical read expected one record");
  }
  return snapshot;
}

export function formatHistoryMoment(value: JsonValue): string {
  if (!isObject(value) || value.__class__ !== "datetime") return String(value);
  const numeric = (name: string) =>
    typeof value[name] === "number" ? String(value[name]).padStart(2, "0") : "00";
  return `${numeric("year")}-${numeric("month")}-${numeric("day")} ${numeric("hour")}:${numeric("minute")}:${numeric("second")}`;
}
