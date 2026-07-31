# Epiton

Modern, multiplatform, Tryton-compatible business client platform.

Epiton keeps the Tryton JSON-RPC contract so existing Tryton modules and apps
(including GNU Health later) keep working, while replacing Sao/GTK with a
faster, safer, adaptive UI.

## Stack

- TypeScript monorepo (pnpm + Turborepo + Biome)
- React 19 + Vite + Tailwind CSS 4
- `@epiton/protocol` — Tryton JSON-RPC Session client
- `@epiton/view-engine` — Tryton XML views → React
- `@epiton/intelligence` — local search, suggestions, adaptive layouts
- Tauri 2 desktop, Capacitor mobile, Axum gateway

## Quick start

```bash
pnpm install
pnpm --filter @epiton/web dev
```

Trytond lab:

```bash
cd docker && docker compose up -d
```

Default lab credentials are documented in `docker/README.md` (synthetic only).

## License

Apache-2.0 for Epiton code. trytond remains GPL-3; Epiton does not copy Sao/GTK source.
