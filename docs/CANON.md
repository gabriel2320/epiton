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
| Sao/Tryton parity matrix | [`docs/COMPATIBILITY.md`](COMPATIBILITY.md) |
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
- Caching session tokens in `localStorage`

Allowed non-authoritative client data:

- `localStorage` key `epiton.connection` → connection preferences only; production web ignores a stored `baseUrl`
- `sessionStorage` board pane order (`epiton.board.order.*`)
- In-memory Session token + preferences after login
- Chart aggregations derived from `search_read` (display only)

## Package canon

| Package | Responsibility |
|---------|----------------|
| `@epiton/protocol` | RPC client, actions, wizards, bus, CSV, keywords, capabilities |
| `@epiton/view-engine` | XML arch parse/render, PYSON, graph/board/analytics helpers |
| `@epiton/ui` | Shared primitives (Button, Alert, ConfirmDialog, …) |
| `@epiton/intelligence` | Local search, suggestions, presets — **no writes** |
| `@epiton/web` | SPA shell + workspaces |
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

## UI state exclusivity

Loading, error, empty, and data presentations are **exclusive** for a given
panel. Mutations must capture origin ids; they must not clear a newer draft
started after the mutation was issued.

## Documentation edit rules

1. Change behavior → update `COMPATIBILITY.md` in the same batch when status shifts.
2. New library → update `TOOLING.md` before merge (or reject with reason).
3. Agent rule change → update `AGENTS.md` (and `AGENT_LOOP.md` if gates change).
4. Do not duplicate governance prose into chat-only plans; write it here.
