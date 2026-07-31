import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const isProd = process.env.NODE_ENV === "production" || process.env.EPITON_CSP === "prod";

/**
 * Prod CSP drops script unsafe-inline (Vite emits hashed modules).
 * Prefer deploying web behind epiton-gateway so connect-src can stay `'self'`.
 * Dev keeps broader connect for direct trytond URLs.
 */
function buildCsp(prod: boolean): string {
  const scriptSrc = prod ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'";
  const connectSrc = prod ? "connect-src 'self'" : "connect-src 'self' http: https: ws: wss:";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    connectSrc,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

const securityHeaders = {
  "Content-Security-Policy": buildCsp(isProd),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export default defineConfig(({ mode }) => {
  const prod = mode === "production";
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "epiton-csp-html",
        transformIndexHtml(html) {
          if (!prod) return html;
          return html.replace(
            /http-equiv="Content-Security-Policy"\s+content="[^"]*"/,
            `http-equiv="Content-Security-Policy" content="${buildCsp(true)}"`,
          );
        },
      },
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
      visualizer({
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
        open: false,
        template: "treemap",
      }),
    ],
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
              return "react-vendor";
            }
            if (id.includes("node_modules/@tanstack")) return "tanstack";
            if (id.includes("node_modules/i18next") || id.includes("node_modules/react-i18next")) {
              return "i18n";
            }
            if (id.includes("node_modules/@fullcalendar")) return "fullcalendar";
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
              return "charts";
            }
            if (id.includes("node_modules/pdfjs-dist")) return "pdf";
            if (id.includes("packages/view-engine")) return "view-engine";
            if (id.includes("packages/protocol")) return "protocol";
          },
        },
      },
    },
    server: {
      port: 5173,
      headers: {
        ...securityHeaders,
        "Content-Security-Policy": buildCsp(false),
      },
    },
    preview: {
      headers: {
        ...securityHeaders,
        "Content-Security-Policy": buildCsp(prod),
      },
    },
  };
});
