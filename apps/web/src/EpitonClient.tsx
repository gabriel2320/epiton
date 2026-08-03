import "./lib/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { App } from "./App";
import { createBackendProjectionClient } from "./lib/backendTruth";

const queryClient = createBackendProjectionClient();

export interface EpitonClientProps {
  development?: boolean;
}

/** Shared application root used by every browser-capable host. */
export function EpitonClient({ development = false }: EpitonClientProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
      {development ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
