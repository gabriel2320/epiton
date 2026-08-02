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

/** Purge every server projection at an authentication boundary. */
export function discardBackendProjection(client: QueryClient): void {
  client.clear();
}
