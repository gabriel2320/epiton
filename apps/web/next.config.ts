import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@epiton/intelligence",
    "@epiton/protocol",
    "@epiton/ui",
    "@epiton/view-engine",
  ],
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
};

export default nextConfig;
