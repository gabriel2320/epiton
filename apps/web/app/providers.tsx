"use client";

import dynamic from "next/dynamic";
import { configureWebHostEnvironment } from "../src/lib/hostEnvironment";

configureWebHostEnvironment({
  production: process.env.NODE_ENV === "production",
  development: process.env.NODE_ENV !== "production",
  configuredGateway: process.env.NEXT_PUBLIC_EPITON_GATEWAY_URL,
  configuredRpcSuffix: process.env.NEXT_PUBLIC_EPITON_RPC_SUFFIX,
  configuredBusEnabled: process.env.NEXT_PUBLIC_EPITON_BUS_ENABLED,
});

const EpitonClient = dynamic(
  () => import("../src/EpitonClient").then((module) => module.EpitonClient),
  {
    ssr: false,
    loading: () => <main aria-busy="true" aria-label="Loading Epiton" />,
  },
);

/** The sole client island while the Tryton workspace remains browser-driven. */
export function EpitonProviders() {
  return <EpitonClient development={process.env.NODE_ENV !== "production"} />;
}
