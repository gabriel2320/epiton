import "./styles/tailwind.css";
import "./styles/app.css";
import { configureWebHostEnvironment } from "./lib/hostEnvironment";

configureWebHostEnvironment({
  production: import.meta.env.PROD,
  development: import.meta.env.DEV,
  configuredGateway: import.meta.env.VITE_EPITON_GATEWAY_URL,
  configuredRpcSuffix: import.meta.env.VITE_EPITON_RPC_SUFFIX,
  configuredBusEnabled: import.meta.env.VITE_EPITON_BUS_ENABLED,
});

async function bootstrap(): Promise<void> {
  const { mountEpiton } = await import("./mount");
  mountEpiton({ development: import.meta.env.DEV });
}

void bootstrap();
