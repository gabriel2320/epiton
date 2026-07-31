import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Epiton",
        short_name: "Epiton",
        theme_color: "#0f1419",
        background_color: "#0f1419",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/epiton.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
