export interface WebHostEnvironment {
  production: boolean;
  development: boolean;
  configuredGateway?: string;
  configuredRpcSuffix?: string;
  configuredBusEnabled?: string;
}

let configuredEnvironment: WebHostEnvironment | undefined;

/**
 * Inject build-host details before loading the shared application runtime.
 * This keeps Vite- and Next-specific environment APIs out of domain code.
 */
export function configureWebHostEnvironment(environment: WebHostEnvironment): void {
  configuredEnvironment = { ...environment };
}

function inferFailSafeEnvironment(): WebHostEnvironment {
  if (typeof window === "undefined") {
    return { production: true, development: false };
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const development = localHosts.has(window.location.hostname);
  return { production: !development, development };
}

/** Production is the fail-safe unless the host explicitly configures Epiton. */
export function currentWebHostEnvironment(): WebHostEnvironment {
  return configuredEnvironment ?? inferFailSafeEnvironment();
}
