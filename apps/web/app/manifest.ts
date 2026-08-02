import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epiton",
    short_name: "Epiton",
    description: "Modern multiplatform Tryton-compatible client",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f1419",
    theme_color: "#0f1419",
    icons: [
      {
        src: "/epiton.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
