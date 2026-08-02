import { QueryClient } from "@tanstack/react-query";

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

/** Purge every server projection at an authentication boundary. */
export function discardBackendProjection(client: QueryClient): void {
  client.clear();
}
