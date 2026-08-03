import type { JsonObject } from "@epiton/protocol";
import { QueryClient } from "@tanstack/react-query";

const SESSION_AUTHORITY_FIELDS = [
  "user",
  "company",
  "company_filter",
  "employee",
  "language",
  "language_direction",
  "groups",
  "companies",
  "employees",
] as const;

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function cacheFingerprint(serialized: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${serialized.length}:${hash.toString(16).padStart(16, "0")}`;
}

function sessionAuthorityJson(context: JsonObject): string {
  return stableJson(SESSION_AUTHORITY_FIELDS.map((field) => context[field] ?? null));
}

/**
 * Non-sensitive identity for the Tryton authority/evaluation boundary.
 * Preference payloads may contain personal data, so query keys include only
 * selectors that can change records, menus, access, language, or defaults.
 */
export function backendSessionScopeKey(context: JsonObject): string {
  return cacheFingerprint(sessionAuthorityJson(context));
}

/** Opaque cache partition for every value sent in an RPC evaluation context. */
export function backendRpcContextKey(context: JsonObject): string {
  return cacheFingerprint(stableJson(context));
}

/** Detect a change that can alter Tryton authorization, defaults, or evaluation. */
export function backendSessionBoundaryChanged(current: JsonObject, next: JsonObject): boolean {
  return sessionAuthorityJson(current) !== sessionAuthorityJson(next);
}

/**
 * React Query is an in-process projection of trytond, never an authority or an
 * offline store. Reconnect/focus always ask the backend for a fresh answer.
 */
export function createBackendProjectionClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
    },
  });
}

/**
 * A Tryton mutation may update records in models other than the one invoked
 * (for example, creating a GNU Health person can create its patient record).
 * Mark every model projection stale so the next workspace observes the
 * backend transaction instead of reusing a still-fresh cross-model cache.
 */
export function invalidateModelProjections(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: ["model"] });
}

/** Purge every server projection at an authentication or authority boundary. */
export function discardBackendProjection(client: QueryClient): void {
  client.clear();
}
