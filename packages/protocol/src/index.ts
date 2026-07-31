import { sessionAuthorization } from "./auth";

export { sessionAuthorization } from "./auth";
export { pollBus } from "./bus";
export { BusClient, type BusMessage } from "./busClient";
export { modelHasAccessRows } from "./acl";
export { resolveAction, resolveWorkspaceModel, type ResolvedAction } from "./actions";
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
  error: JsonRpcErrorBody;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface TrytonSession {
  login: string;
  userId: number;
  session: string;
}

export interface ServerCapabilities {
  serverVersion: string | null;
  series: "7" | "8" | "unknown";
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
  /**
   * RPC path under the database.
   * Tryton docs use `rpc`; some 7.x docker deployments expose JSON-RPC at `/{db}/`.
   * Default: auto (`""` then `"rpc"` on first 405).
   */
  rpcSuffix?: "" | "rpc" | "auto";
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

function encodeSessionAuthorization(session: TrytonSession): string {
  return sessionAuthorization(session);
}

function parseSeries(version: string | null): ServerCapabilities["series"] {
  if (!version) return "unknown";
  if (version.startsWith("7.")) return "7";
  if (version.startsWith("8.")) return "8";
  return "unknown";
}

let rpcSeq = 1;

export class EpitonClient {
  readonly baseUrl: string;
  readonly database: string;
  private readonly fetchImpl: typeof fetch;
  private readonly correlationId?: () => string;
  private session: TrytonSession | null = null;
  private capabilities: ServerCapabilities | null = null;
  private rpcSuffix: "" | "rpc";

  constructor(options: EpitonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.database = options.database;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.correlationId = options.correlationId;
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
      const result = await this.callUnauthenticated("common.server.version", []);
      if (typeof result === "string") serverVersion = result;
      else if (Array.isArray(result) && typeof result[0] === "string") {
        serverVersion = result[0];
      }
    } catch {
      serverVersion = null;
    }

    const [supportsBus, supportsRest] = await Promise.all([
      this.probeEndpoint(this.busUrl(), "POST"),
      // Stock trytond does not expose a dedicated REST root; keep false unless a probe is added.
      Promise.resolve(false),
    ]);

    const caps: ServerCapabilities = {
      serverVersion,
      series: parseSeries(serverVersion),
      supportsBus,
      supportsRest,
      supportsSessionCookie: false,
    };
    this.capabilities = caps;
    return caps;
  }

  /** Probe whether an HTTP endpoint exists (not 404 / network failure). */
  private async probeEndpoint(url: string, method: string): Promise<boolean> {
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      return response.status !== 404;
    } catch {
      return false;
    }
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

    const userId = Number(result[0]);
    const sessionToken = String(result[1]);
    if (!Number.isFinite(userId) || !sessionToken) {
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
    order: string | null = null,
    context: JsonObject = {},
  ): Promise<JsonObject[]> {
    const result = await this.model(
      model,
      "search_read",
      [domain, offset, limit, order, fields],
      context,
    );
    if (!Array.isArray(result)) {
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
    const id = rpcSeq++;
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
    });

    if (response.status === 405 && this.rpcSuffix === "") {
      this.rpcSuffix = "rpc";
      response = await this.fetchImpl(this.rpcUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }

    if (!response.ok) {
      throw new TrytonRpcError(`HTTP ${response.status}`, response.status);
    }

    const payload = (await response.json()) as JsonRpcResponse;
    if ("error" in payload && payload.error) {
      throw new TrytonRpcError(payload.error.message, payload.error.code, payload.error.data);
    }
    if (!("result" in payload)) {
      throw new TrytonRpcError(
        "Malformed JSON-RPC response",
        -32700,
        payload as unknown as JsonValue,
      );
    }
    return payload.result;
  }
}

export function createClient(options: EpitonClientOptions): EpitonClient {
  return new EpitonClient(options);
}
