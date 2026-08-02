# Epitón

Modern, multiplatform, **Tryton-compatible** business client.

Epitón keeps the Tryton JSON-RPC Session contract so existing Tryton modules
(and later GNU Health) keep working, while replacing Sao/GTK with a faster,
safer, adaptive UI. **trytond remains the system of record.**

> Epitón is not Epione HIS. It does not store clinical truth and does not claim
> PHI production readiness. See [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md).

## Documentation map (canon)

| Doc | Purpose |
|-----|---------|
| [`AGENTS.md`](AGENTS.md) | Hard rails for AI coding agents |
| [`docs/CANON.md`](docs/CANON.md) | Sources of truth and doc authority |
| [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) | PHI, license, promotion, approvals |
| [`docs/AGENT_LOOP.md`](docs/AGENT_LOOP.md) | Daily gates and “continua” loop |
| [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) | Sao/Tryton parity matrix |
| [`docs/THREE_LAYER_ARCHITECTURE.md`](docs/THREE_LAYER_ARCHITECTURE.md) | Three-layer map and Next.js host convergence |
| [`docs/CLIENT_CAPABILITY_INVENTORY.md`](docs/CLIENT_CAPABILITY_INVENTORY.md) | Tryton client capability ownership/evidence inventory |
| [`docs/TOOLING.md`](docs/TOOLING.md) | Library allow/deny (SQLAlchemy, shadcn, …) |
| [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md) | On-device search/suggestions (no auto-writes) |
| [`docs/GNU_HEALTH.md`](docs/GNU_HEALTH.md) | GNU Health metadata-only discovery contract |
| [`docs/BRAND.md`](docs/BRAND.md) | Brand brief |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Point-in-time audit (2026-07-31) |
| [`docs/TRYTON_COMPARE.md`](docs/TRYTON_COMPARE.md) | Tryton vs Epitón + live compat evidence |
| [`docs/TRYTON_AHEAD.md`](docs/TRYTON_AHEAD.md) | Areas where Sao/GTK still surpass Epitón |
| [`apps/gateway/README.md`](apps/gateway/README.md) | Axum gateway |
| [`docker/README.md`](docker/README.md) | Synthetic trytond lab |

## Stack

- TypeScript monorepo (pnpm + Turborepo + Biome)
- Next.js 16 App Router target + React 19 + Tailwind CSS 4
- Next production-web host with per-request CSP and a static-only PWA cache
- Vite static packaging adapter for Tauri/Capacitor; temporarily also the web
  release bridge until the N2 web cutover
- `@epiton/protocol` — Tryton JSON-RPC Session (`/{db}/` + `/rpc/` fallback)
- `@epiton/view-engine` — Tryton XML views → React (+ graph/board analytics helpers)
- `@epiton/ui` — shared primitives
- `@epiton/intelligence` — local search, suggestions, adaptive layouts
- Tauri 2 desktop, Capacitor mobile, Axum gateway

## Quick start

```bash
pnpm install
pnpm --filter @epiton/web dev
```

Trytond lab (synthetic only):

```bash
pnpm lab:up
pnpm lab:smoke
pnpm lab:smoke:live
# Supported Tryton 8 tier (port 8001 / gateway 8081):
pnpm lab:up:8
```

Default lab credentials: [`docker/README.md`](docker/README.md).

Production web uses a mandatory same-origin gateway. Direct trytond endpoints
remain available only to native shells and controlled development:

```bash
pnpm lab:up          # Tryton 7 + gateway on :8080
pnpm gateway:smoke
```

Compatibility and browser-boundary checks (synthetic disposable data only):

```bash
pnpm compat:live       # Epiton protocol contract
pnpm lab:oracle:7      # isolated Proteus reference oracle
pnpm test:e2e:mock     # deterministic browser suite
pnpm test:e2e:next     # production Next host + nonce CSP/static-only PWA suite
pnpm test:e2e:live     # requires EPITON_E2E_LAB=disposable
pnpm --filter @epiton/mobile sync:android       # native asset receipt
pnpm --filter @epiton/mobile build:android:debug # requires JDK + Android SDK
pnpm --filter @epiton/desktop build:linux        # requires Rust + Linux WebKit
```

## Agent / AI usage

1. Read [`AGENTS.md`](AGENTS.md) before editing.
2. Follow [`docs/AGENT_LOOP.md`](docs/AGENT_LOOP.md) for gates.
3. Treat [`docs/CANON.md`](docs/CANON.md) + [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md)
   as authority for SoT, PHI, and license.
4. Update [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) when parity status changes.
5. Do not introduce rejected libraries from [`docs/TOOLING.md`](docs/TOOLING.md).

Minimum close-out:

```bash
pnpm lint && pnpm test && pnpm --filter @epiton/web build && pnpm check:bundle
```

## Architecture (one glance)

```text
Production browser  →  same-origin reverse proxy → apps/gateway
Native / dev client →  apps/gateway or controlled trytond endpoint
All clients         →  @epiton/protocol (Session RPC)
                    →  trytond  →  PostgreSQL
```

Client analytics (boards/graphs) only visualize `search_read` / graph arch.
They are not a second database.

## License

Apache-2.0 for Epitón code. trytond remains GPL-3; Epitón does not copy Sao/GTK
source. Wire-level compatibility ≠ code derivation.
