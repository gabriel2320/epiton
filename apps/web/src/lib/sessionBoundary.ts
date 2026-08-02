import type { QueryClient } from "@tanstack/react-query";
import { discardBackendProjection } from "./backendTruth";
import { useAppStore } from "./store";

/**
 * Atomically discard every authenticated client-side projection.
 * trytond remains the only authority; nothing from the old session may be
 * displayed to another user or restored by browser lifecycle caching.
 */
export function clearClientAuthentication(queryClient: QueryClient): void {
  const state = useAppStore.getState();
  state.client?.setSession(null);
  discardBackendProjection(queryClient);
  state.clearAuthentication();
}
