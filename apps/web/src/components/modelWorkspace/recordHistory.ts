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

// React Strict Mode deliberately replays effects in development. Coalesce only
// identical requests that are still in flight so a replay neither duplicates a
// clinical read nor creates a second server audit event. Resolved snapshots are
// never retained in the client.
const inFlightByClient = new WeakMap<RecordHistoryClient, Map<string, Promise<JsonValue>>>();

function requestKey(model: string, method: string, params: JsonValue[], context: JsonObject) {
  return JSON.stringify([model, method, params, context]);
}

function requestOnce(
  client: RecordHistoryClient,
  model: string,
  method: string,
  params: JsonValue[],
  context: JsonObject,
): Promise<JsonValue> {
  let requests = inFlightByClient.get(client);
  if (!requests) {
    requests = new Map();
    inFlightByClient.set(client, requests);
  }
  const key = requestKey(model, method, params, context);
  const existing = requests.get(key);
  if (existing) return existing;

  const pending = client.model(model, method, params, context);
  requests.set(key, pending);
  const cleanup = () => {
    if (requests.get(key) === pending) requests.delete(key);
  };
  void pending.then(cleanup, cleanup);
  return pending;
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
  const result = await requestOnce(client, model, "history_revisions", [[recordId]], context);
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
  const result = await requestOnce(client, model, "read", [[revision.recordId], fields], {
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
