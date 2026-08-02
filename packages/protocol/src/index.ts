import { sessionAuthorization } from "./auth";

export { sessionAuthorization } from "./auth";
export { pollBus } from "./bus";
export { BusClient, type BusClientOptions, type BusMessage } from "./busClient";
export { modelHasAccessRows } from "./acl";
export {
  openActionUrl,
  resolveAction,
  resolveWorkspaceModel,
  type ActWindowDomainTab,
  type ResolvedAction,
} from "./actions";
export {
  wizardCreate,
  wizardDataForState,
  wizardDelete,
  wizardExecute,
  type WizardExecuteResult,
  type WizardSession,
} from "./wizards";
export {
  applyFieldChange,
  buildOnChangeArgs,
  preValidateRecord,
  type FieldOnChangeMeta,
  type OnChangeValues,
} from "./onchange";
export {
  asJsonObject,
  buildSessionContext,
  loadUserPreferences,
  viewIdForMode,
  type SessionPreferences,
} from "./session_context";
export { wizardActionRefs } from "./wizard_actions";
export { csvEscape, exportModelCsv, rowsToCsv } from "./export_csv";
export { importModelCsv, parseCsv } from "./import_csv";
export { reloadSessionPreferences, saveUserPreferences } from "./preferences";
export { resolveBoardAction } from "./board";
export { copyRecords } from "./copy";
export { listDatabases } from "./databases";
export {
  getKeywords,
  getRecordKeywords,
  type ActionKeyword,
  type KeywordAction,
} from "./keywords";
export {
  createViewSearch,
  deleteViewSearch,
  loadViewSearches,
  type ViewSearchRow,
} from "./view_search";
export { loadTranslationCatalog, type TranslationRow } from "./translations";
export { loadTreeState, saveTreeState, serializeTreeDomain } from "./tree_state";
export { loadMenus, setMenuFavorite, type TrytonMenu } from "./menus";

export type JsonRpcId = string | number | null;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params: JsonValue[];
}

export interface JsonRpcSuccess {
  id: JsonRpcId;
  result: JsonValue;
}

export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface JsonRpcFailure {
  id: JsonRpcId;
  /** Tryton uses both the JSON-RPC object form and a legacy [message, trace] tuple. */
  error: JsonRpcErrorBody | JsonValue[];
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface TrytonSession {
  login: string;
  userId: number;
  session: string;
}

/** Observed upstream release series. This is discovery evidence, not a support claim. */
export type TrytonSeries = `${number}.${number}`;

export interface ServerCapabilities {
  serverVersion: string | null;
  series: TrytonSeries | null;
  supportsBus: boolean;
  supportsRest: boolean;
  supportsSessionCookie: boolean;
}

export interface EpitonClientOptions {
  /** Base URL of trytond or epiton-gateway, e.g. http://localhost:8000 */
  baseUrl: string;
  database: string;
  fetchImpl?: typeof fetch;
  /** Optional correlation id factory for gateway audit */
  correlationId?: () => string;
  /** Called after the backend rejects an authenticated request. */
  onSessionInvalidated?: () => void;
  /**
   * RPC path under the database.
   * Tryton docs use `rpc`; some 7.x docker deployments expose JSON-RPC at `/{db}/`.
   * Default: auto (`""` then `"rpc"` on first 405).
   */
  rpcSuffix?: "" | "rpc" | "auto";
  /**
   * Whether the deployment has enabled Tryton's authenticated bus subscription.
   * The route may exist while subscriptions are disabled, so this is explicit and
   * defaults to false instead of being inferred from an error response.
   */
  supportsBus?: boolean;
}

export class TrytonRpcError extends Error {
  readonly code: number;
  readonly data?: JsonValue;

  constructor(message: string, code: number, data?: JsonValue) {
    super(message);
    this.name = "TrytonRpcError";
    this.code = code;
    this.data = data;
  }
}

export type SearchOrder = string | Array<[field: string, direction: string]> | null;

function normalizeSearchOrder(order: SearchOrder): JsonValue {
  if (order === null || Array.isArray(order)) return order;

  // Tryton's RPC boundary expects a sequence of (field, direction) pairs. Keep
  // accepting the compact strings traditionally used by EPITON callers, but
  // normalize them before they cross the protocol boundary.
  return order
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => {
      const match = /^(\S+)(?:\s+(ASC|DESC))?$/i.exec(term);
      if (!match) {
        throw new TrytonRpcError(`Invalid search order: ${term}`, -32602);
      }
      return [match[1] as string, (match[2] ?? "ASC").toUpperCase()];
    });
}

function encodeSessionAuthorization(session: TrytonSession): string {
  return sessionAuthorization(session);
}

export function trytonSeriesFromVersion(version: string | null): TrytonSeries | null {
  if (!version) return null;
  const match = /^\s*(\d+)\.(\d+)(?:[.+-]|$)/.exec(version);
  return match ? (`${match[1]}.${match[2]}` as TrytonSeries) : null;
}

function malformedRpcResponse(message: string, payload?: unknown): TrytonRpcError {
  return payload === undefined
    ? new TrytonRpcError(message, -32700)
    : new TrytonRpcError(message, -32700, payload as JsonValue);
}

export class EpitonClient {
  readonly baseUrl: string;
  readonly database: string;
  private readonly fetchImpl: typeof fetch;
  private readonly correlationId?: () => string;
  private readonly onSessionInvalidated?: () => void;
  private readonly configuredBusSupport: boolean;
  private session: TrytonSession | null = null;
  private capabilities: ServerCapabilities | null = null;
  private rpcSuffix: "" | "rpc";
  private rpcSeq = 1;

  constructor(options: EpitonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.database = options.database;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.correlationId = options.correlationId;
    this.onSessionInvalidated = options.onSessionInvalidated;
    this.configuredBusSupport = options.supportsBus === true;
    const suffix = options.rpcSuffix ?? "auto";
    this.rpcSuffix = suffix === "rpc" ? "rpc" : "";
    if (suffix === "auto") {
      // Prefer bare /{db}/ (observed on tryton/tryton:7.0); fall back in dispatch on 405.
      this.rpcSuffix = "";
    }
  }

  getSession(): TrytonSession | null {
    return this.session;
  }

  setSession(session: TrytonSession | null): void {
    this.session = session;
  }

  getCapabilities(): ServerCapabilities | null {
    return this.capabilities;
  }

  rpcUrl(): string {
    const db = encodeURIComponent(this.database);
    return this.rpcSuffix === "rpc" ? `${this.baseUrl}/${db}/rpc/` : `${this.baseUrl}/${db}/`;
  }

  async detectCapabilities(): Promise<ServerCapabilities> {
    let serverVersion: string | null = null;
    try {
      const result = this.session
        ? await this.call("common.server.version", [])
        : await this.callUnauthenticated("common.server.version", []);
      if (typeof result === "string") serverVersion = result;
      else if (Array.isArray(result) && typeof result[0] === "string") {
        serverVersion = result[0];
      }
    } catch {
      serverVersion = null;
    }

    const caps: ServerCapabilities = {
      serverVersion,
      series: trytonSeriesFromVersion(serverVersion),
      supportsBus: this.configuredBusSupport,
      // Stock trytond does not expose a dedicated REST root.
      supportsRest: false,
      supportsSessionCookie: false,
    };
    this.capabilities = caps;
    return caps;
  }

  async login(username: string, password: string, lang = "en"): Promise<TrytonSession> {
    const result = await this.callUnauthenticated("common.db.login", [
      username,
      { password },
      lang,
    ]);

    if (!Array.isArray(result) || result.length < 2) {
      throw new TrytonRpcError("Invalid login response", -32000, result);
    }

    const userId = result[0];
    const sessionToken = result[1];
    if (
      typeof userId !== "number" ||
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      typeof sessionToken !== "string" ||
      sessionToken.length === 0
    ) {
      throw new TrytonRpcError("Login did not return user id/session", -32000, result);
    }

    this.session = { login: username, userId, session: sessionToken };
    return this.session;
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      await this.call("common.db.logout", []);
    } finally {
      this.session = null;
    }
  }

  async call(method: string, params: JsonValue[] = []): Promise<JsonValue> {
    return this.dispatch(method, params, true);
  }

  async callUnauthenticated(method: string, params: JsonValue[] = []): Promise<JsonValue> {
    return this.dispatch(method, params, false);
  }

  async model(
    model: string,
    method: string,
    params: JsonValue[] = [],
    context: JsonObject = {},
  ): Promise<JsonValue> {
    const rpcParams = [...params, context];
    return this.call(`model.${model}.${method}`, rpcParams);
  }

  async searchRead(
    model: string,
    domain: JsonValue[] = [],
    fields: string[] = [],
    offset = 0,
    limit: number | null = 80,
    order: SearchOrder = null,
    context: JsonObject = {},
  ): Promise<JsonObject[]> {
    const result = await this.model(
      model,
      "search_read",
      [domain, offset, limit, normalizeSearchOrder(order), fields],
      context,
    );
    if (
      !Array.isArray(result) ||
      result.some((row) => !row || typeof row !== "object" || Array.isArray(row))
    ) {
      throw new TrytonRpcError("search_read expected array", -32000, result);
    }
    return result as JsonObject[];
  }

  async fieldsViewGet(
    model: string,
    viewId: number | null = null,
    viewType: "form" | "tree" | "list-form" | "board" | "calendar" | "graph" = "form",
    context: JsonObject = {},
  ): Promise<JsonObject> {
    const result = await this.model(model, "fields_view_get", [viewId, viewType], context);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new TrytonRpcError("fields_view_get expected object", -32000, result);
    }
    return result as JsonObject;
  }

  busUrl(): string {
    return `${this.baseUrl}/${encodeURIComponent(this.database)}/bus`;
  }

  private async dispatch(
    method: string,
    params: JsonValue[],
    authenticated: boolean,
  ): Promise<JsonValue> {
    const id = this.rpcSeq++;
    const body: JsonRpcRequest = { id, method, params };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.correlationId) {
      headers["X-Correlation-Id"] = this.correlationId();
    }

    if (authenticated) {
      if (!this.session) {
        throw new TrytonRpcError("Not authenticated", 401);
      }
      headers.Authorization = encodeSessionAuthorization(this.session);
    }

    let response = await this.fetchImpl(this.rpcUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });

    if (response.status === 405 && this.rpcSuffix === "") {
      this.rpcSuffix = "rpc";
      response = await this.fetchImpl(this.rpcUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    }

    if (!response.ok) {
      if (authenticated && response.status === 401) this.invalidateSession();
      throw new TrytonRpcError(`HTTP ${response.status}`, response.status);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw malformedRpcResponse("Malformed JSON-RPC response: invalid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw malformedRpcResponse("Malformed JSON-RPC response: expected object", parsed);
    }

    const payload = parsed as Record<string, unknown>;
    if (payload.id !== id) {
      throw malformedRpcResponse("Malformed JSON-RPC response: id mismatch", parsed);
    }

    const hasResult = Object.prototype.hasOwnProperty.call(payload, "result");
    const hasError = Object.prototype.hasOwnProperty.call(payload, "error");
    if (hasResult === hasError) {
      throw malformedRpcResponse(
        "Malformed JSON-RPC response: expected exactly one of result or error",
        parsed,
      );
    }

    if (hasError) {
      const error = payload.error;
      if (Array.isArray(error)) {
        if (typeof error[0] !== "string") {
          throw malformedRpcResponse("Malformed JSON-RPC response: invalid legacy error", parsed);
        }
        throw new TrytonRpcError(error[0], -32000, error as JsonValue[]);
      }
      if (!error || typeof error !== "object") {
        throw malformedRpcResponse("Malformed JSON-RPC response: invalid error object", parsed);
      }
      const rpcError = error as Record<string, unknown>;
      if (
        typeof rpcError.code !== "number" ||
        !Number.isFinite(rpcError.code) ||
        typeof rpcError.message !== "string"
      ) {
        throw malformedRpcResponse("Malformed JSON-RPC response: invalid error object", parsed);
      }
      throw new TrytonRpcError(
        rpcError.message,
        rpcError.code,
        rpcError.data as JsonValue | undefined,
      );
    }
    return payload.result as JsonValue;
  }

  private invalidateSession(): void {
    if (!this.session) return;
    this.session = null;
    try {
      this.onSessionInvalidated?.();
    } catch {
      // Authentication state must still be cleared if a UI observer fails.
    }
  }
}

export function createClient(options: EpitonClientOptions): EpitonClient {
  return new EpitonClient(options);
}
