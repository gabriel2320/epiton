import { currentWebHostEnvironment } from "./hostEnvironment";
import { type ShellKind, detectShell } from "./nativeShell";

export interface RuntimePolicyInput {
  production: boolean;
  shell: ShellKind;
  origin: string;
  configuredGateway?: string;
  configuredRpcSuffix?: string;
  configuredBusEnabled?: string;
}

export interface RuntimeConnectionPolicy {
  baseUrl: string;
  serverLocked: boolean;
  rpcSuffix: "" | "rpc" | "auto";
  supportsBus: boolean;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseHttpBaseUrl(value: string, base?: string): URL {
  const url = base ? new URL(value, base) : new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Gateway URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Gateway URL must not contain credentials");
  }
  return url;
}

function parseRpcSuffix(value?: string): "" | "rpc" | "auto" {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "auto") return "auto";
  if (normalized === "rpc") return "rpc";
  if (normalized === "bare") return "";
  throw new Error("RPC suffix must be auto, rpc, or bare");
}

function parseBusEnabled(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new Error("Bus enabled must be true or false");
}

/**
 * Production browser traffic is deliberately pinned to a same-origin gateway.
 * Native shells and local development may point at an explicit endpoint.
 */
export function resolveRuntimeConnectionPolicy(input: RuntimePolicyInput): RuntimeConnectionPolicy {
  const configured = input.configuredGateway?.trim();
  const rpcSuffix = parseRpcSuffix(input.configuredRpcSuffix);
  const supportsBus = parseBusEnabled(input.configuredBusEnabled);
  if (input.production && input.shell === "web") {
    const origin = new URL(input.origin).origin;
    const gateway = parseHttpBaseUrl(configured || origin, `${origin}/`);
    if (gateway.origin !== origin) {
      throw new Error("Production web gateway must be same-origin");
    }
    return { baseUrl: cleanBaseUrl(gateway.href), serverLocked: true, rpcSuffix, supportsBus };
  }

  const candidate = configured || "http://localhost:8080";
  const gateway = parseHttpBaseUrl(candidate, input.origin);
  return { baseUrl: cleanBaseUrl(gateway.href), serverLocked: false, rpcSuffix, supportsBus };
}

export function runtimeConnectionPolicy(): RuntimeConnectionPolicy {
  const environment = currentWebHostEnvironment();
  const origin =
    typeof window !== "undefined" && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost";
  return resolveRuntimeConnectionPolicy({
    production: environment.production,
    shell: detectShell(),
    origin,
    configuredGateway: environment.configuredGateway,
    configuredRpcSuffix: environment.configuredRpcSuffix,
    configuredBusEnabled: environment.configuredBusEnabled,
  });
}

export function normalizeConnectionBaseUrl(requested: string): string {
  const policy = runtimeConnectionPolicy();
  if (policy.serverLocked) return policy.baseUrl;
  const parsed = parseHttpBaseUrl(requested);
  return cleanBaseUrl(parsed.href);
}
