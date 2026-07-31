# Epiton

Modern, multiplatform, Tryton-compatible business client platform.

Epiton keeps the Tryton JSON-RPC contract so existing Tryton modules and apps
(including GNU Health later) keep working, while replacing Sao/GTK with a
faster, safer, adaptive UI.

## Stack

- TypeScript monorepo (pnpm + Turborepo + Biome)
- React 19 + Vite + Tailwind CSS 4
- `@epiton/protocol` — Tryton JSON-RPC Session client (`/{db}/` + `/rpc/` fallback)
- `@epiton/view-engine` — Tryton XML views → React
- `@epiton/intelligence` — local search, suggestions, adaptive layouts
- Tauri 2 desktop, Capacitor mobile, Axum gateway

## Tooling decisions

See [`docs/TOOLING.md`](docs/TOOLING.md) for evaluations of SQLAlchemy, Pydantic,
Alembic, NumPy, WeasyPrint, ReportLab, FastAPI, Tailwind, and shadcn (spoiler:
keep Tailwind; reject Python ORM/report stacks for the client runtime).

## Quick start

```bash
pnpm install
pnpm --filter @epiton/web dev
```

Trytond lab:

```bash
pnpm lab:up
pnpm lab:smoke
pnpm lab:smoke:live
# Optional Tryton 8 (port 8001 / gateway 8081):
# pnpm lab:up:8
```

Default lab credentials are documented in `docker/README.md` (synthetic only).

## License

Apache-2.0 for Epiton code. trytond remains GPL-3; Epiton does not copy Sao/GTK source.
