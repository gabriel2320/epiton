# Epitón canon

Non-negotiable sources of truth for humans and agents. If two documents
disagree, this file wins on **authority**; then the linked specialist doc.

## Product identity

| Claim | Canon |
|-------|-------|
| What Epitón is | Modern **Tryton-compatible client** (web/desktop/mobile) with an Axum gateway required for production web |
| Business/clinical truth | **trytond** (PostgreSQL via Tryton modules) — never the browser |
| Interaction contract | Tryton **JSON-RPC Session** (`Authorization: Session`) |
| License of Epitón code | **Apache-2.0** (`LICENSE`) |
| License of trytond / Sao | GPL — **do not copy** Sao/GTK source into this tree |
| Relation to Epione | Separate product. Epitón is not Epione HIS and does not inherit Epione PHI promotion rules by name alone |

## Canonical documents

| Concern | Document |
|---------|----------|
| Agent rules (hard rails) | [`AGENTS.md`](../AGENTS.md) |
| Agent daily loop / gates | [`docs/AGENT_LOOP.md`](AGENT_LOOP.md) |
| Governance / approvals / PHI | [`docs/GOVERNANCE.md`](GOVERNANCE.md) |
| Client/gateway threat model and release baseline | [`docs/THREAT_MODEL.md`](THREAT_MODEL.md) |
| Native artifact production-distribution gate | [`docs/NATIVE_RELEASE.md`](NATIVE_RELEASE.md) |
| Sao/Tryton parity matrix | [`docs/COMPATIBILITY.md`](COMPATIBILITY.md) |
| Three-layer architecture and host convergence | [`docs/THREE_LAYER_ARCHITECTURE.md`](THREE_LAYER_ARCHITECTURE.md) |
| Tryton client capability routing inventory | [`docs/CLIENT_CAPABILITY_INVENTORY.md`](CLIENT_CAPABILITY_INVENTORY.md) |
| Tryton series targets, certifications, and canary activation | [`config/tryton-series-policy.json`](../config/tryton-series-policy.json) |
| Library allow/deny | [`docs/TOOLING.md`](TOOLING.md) |
| On-device intelligence | [`docs/INTELLIGENCE.md`](INTELLIGENCE.md) |
| GNU Health path | [`docs/GNU_HEALTH.md`](GNU_HEALTH.md) |
| Brand | [`docs/BRAND.md`](BRAND.md) |
| Point-in-time audit | [`docs/AUDIT.md`](AUDIT.md) |
| Tryton comparison + live compat | [`docs/TRYTON_COMPARE.md`](TRYTON_COMPARE.md) |
| Where Tryton still leads (Sao depth) | [`docs/TRYTON_AHEAD.md`](TRYTON_AHEAD.md) |
| Client-depth development program (derived schedule) | [`docs/TRYTON_AHEAD.md`](TRYTON_AHEAD.md#development-program-derived-from-audit--parity-work) |
| Gateway ops | [`apps/gateway/README.md`](../apps/gateway/README.md) |
| Lab credentials (synthetic) | [`docker/README.md`](../docker/README.md) |
| Hub README | [`README.md`](../README.md) |

Do **not** invent a second roadmap file. Persist durable status in
`COMPATIBILITY.md` / `AUDIT.md` / `GNU_HEALTH.md` only.

## Source of truth by layer

```text
┌─────────────────────────────────────────────────────────┐
│  UI state (React / Zustand) — ephemeral, non-authoritative │
├─────────────────────────────────────────────────────────┤
│  @epiton/protocol — Session JSON-RPC client shape          │
├─────────────────────────────────────────────────────────┤
│  apps/gateway — required production-web security boundary │
├─────────────────────────────────────────────────────────┤
│  trytond — AUTHORITATIVE models, ACLs, wizards, reports    │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL — owned by trytond / Tryton modules            │
└─────────────────────────────────────────────────────────┘
```

Forbidden second truths:

- Client SQLAlchemy / direct Postgres from the SPA
- Client-authored clinical PDFs as “system of record”
- Intelligence auto-`write` / auto-`create` / auto-`delete`
- Any implicit durable client copy of authentication, connection details,
  backend/model/record identifiers, RPC payloads, drafts, domains, navigation,
  layout, or preferences
- Backend/model/record identifiers encoded into URL or browser history
- Client-fabricated menus, views, business rows, favorites, defaults, or action
  targets when trytond is unavailable or returns malformed data

Allowed non-authoritative client data:

- Session, connection, preferences, navigation, layout, and backend projections
  in process memory only; user-scoped state is purged on logout, authenticated
  401, and page lifecycle teardown
- Chart aggregations derived from `search_read` in memory (display only)
- Deletion-only migration adapters for erasing historical storage keys; they may
  never read or hydrate stored values
- Explicit user exports/downloads initiated by a user gesture
- PWA precache of static build assets only; never RPC, bus, authentication, or
  other dynamic responses

JSON-RPC responses are accepted only when their id matches the request and the
envelope contains exactly one of `result` or `error`. The browser and bus use
`no-store`, omit ambient credentials, and suppress referrer data.

Navigation authority also stays in trytond: menus come from `ir.ui.menu`, and
per-user favorites use only `ir.ui.menu.favorite.get/set/unset`. A failed or
malformed backend response produces an explicit unavailable/error state; the
client must not substitute a plausible local business projection.

## Package canon

| Package | Responsibility |
|---------|----------------|
| `@epiton/protocol` | RPC client, actions, wizards, bus, CSV, keywords, capabilities |
| `@epiton/view-engine` | XML arch parse/render, PYSON, graph/board/analytics helpers |
| `@epiton/ui` | Shared primitives (Button, Alert, ConfirmDialog, …) |
| `@epiton/intelligence` | Local search, suggestions, presets — **no writes** |
| `@epiton/web` | Next.js target host + temporary Vite static bridge + shared workspaces |
| `@epiton/desktop` | Tauri beta shell; session stays in memory |
| `@epiton/mobile` | Capacitor beta shell; session stays in memory |
| `epiton-gateway` | Axum reverse proxy |

## RPC shape (Sao-compatible, not GPL)

Prefer Sao-shaped parameter lists for model/wizard/report methods so existing
Tryton modules keep working. Reimplement helpers in TypeScript; never paste
Sao/GTK code.

Default lab RPC bases:

- Tryton 7 compose: `http://127.0.0.1:8000/{db}/` with `/rpc/` fallback
- Tryton 7 gateway: `http://127.0.0.1:8080`
- Tryton 8 gateway: `http://127.0.0.1:8081`

Proteus is permitted only as a pinned, isolated compatibility oracle under
`docker/proteus/`. It is not a runtime dependency and must not enter UI or
production paths.

The server series exposed by `@epiton/protocol` is an observed `X.Y` capability,
not a support enum. Supported tiers and the evidence required to activate the
Tryton 9 lab are declared separately in
[`config/tryton-series-policy.json`](../config/tryton-series-policy.json).

## UI state exclusivity

Loading, error, empty, and data presentations are **exclusive** for a given
panel. Mutations must capture origin ids; they must not clear a newer draft
started after the mutation was issued.

## Documentation edit rules

1. Change behavior → update `COMPATIBILITY.md` in the same batch when status shifts.
2. New library → update `TOOLING.md` before merge (or reject with reason).
3. Agent rule change → update `AGENTS.md` (and `AGENT_LOOP.md` if gates change).
4. Do not duplicate governance prose into chat-only plans; write it here.
