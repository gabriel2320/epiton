# Epitón vs Tryton — comparison & compatibility evidence

Date: **2026-08-01**. Supported lab tiers: Tryton **7.0** and **8.0**, each
behind its own Epitón gateway.
Authority: [`CANON.md`](CANON.md) · Matrix: [`COMPATIBILITY.md`](COMPATIBILITY.md).

## What we compare

| Layer | Tryton / Sao | Epitón |
|-------|--------------|--------|
| System of record | trytond + PostgreSQL | Same — client never owns DB |
| Wire protocol | JSON-RPC 1.0 Session | `@epiton/protocol` (same auth shape) |
| Desktop UI reference | Sao (web) / tryton GTK | React SPA (+ Tauri / Capacitor) |
| Source license | GPL trytond / Sao | Apache-2.0 Epitón (no Sao copy) |
| Views | `fields_view_get` XML arch | `view-engine` parse + hosts |
| Actions | `ir.action.*` + keywords | `resolveAction` / keywords / URL guard |
| Reports | `report.*.execute` | Download/preview + visual companion |
| Boards | Embedded act_window panes | Interactive panes + native DnD analytics |

Epitón aims for **wire + UX parity**, not a GPL reimplementation.

## Side-by-side capability

| Capability | Tryton (Sao) | Epitón | Evidence |
|------------|--------------|--------|----------|
| Login / logout Session | Yes | Yes | `compat:live` PASS |
| `search_read` / `search_count` | Yes | Yes | PASS |
| `fields_view_get` tree/form | Yes | Yes | PASS (party.party) |
| CRUD + `copy` + `export_data` | Yes | Yes | PASS |
| `default_get` / preferences | Yes | Yes | PASS |
| `ir.action.act_window` resolve | Yes | Yes | PASS (Parties #68) |
| Menus + user favorites | Yes | Yes | PASS (`ir.ui.menu` + `ir.ui.menu.favorite.get`) |
| Keywords `get_keyword` | Yes | Yes | PASS (relate) |
| Attachments model | Yes | Yes | PASS (search) |
| Bus endpoint | Yes | Client + panel | `supportsBus: true` |
| Graph arch on party | Often module-specific | Host ready | Lab: no party graph view |
| Board views | Dashboard modules | Host ready | Lab: no board views installed |
| Unauth `common.server.version` | Varies | Soft probe | Lab returns empty/401 pre-login |
| Full embedded Sao board screens | Yes | Improved (tree/graph/form + `_actions`) | BoardWorkspace / BoardPane |
| `_actions` cross-filter | Yes | Improved (`_actions` + heuristics) | BoardWorkspace |
| REST Bearer | Optional apps | Not probed | Prefer Session + gateway |

## How to run the suites

```bash
# Offline contract + fixture replay
pnpm --filter @epiton/compat test

# RPC route alive
pnpm lab:smoke

# Short live CRUD smoke
pnpm lab:smoke:live

# Full live compatibility matrix (writes receipt JSON)
pnpm compat:live

# Pinned, isolated reference-client oracle
pnpm lab:oracle:7
pnpm lab:oracle:8

# Browser boundary
pnpm test:e2e:mock
EPITON_E2E_LAB=disposable pnpm test:e2e:live
```

Receipts (gitignored): `tests/compat/receipts/compat-live-<series>-latest.json`
and `proteus-<series>-latest.json`.

CI runs lint/typecheck/test/build/bundle, a deterministic browser suite, Rust
gateway gates, and a Tryton 7/8 matrix containing protocol, Proteus-oracle, and
live browser checks.

## Live run snapshot (2026-08-01)

Commands: `pnpm compat:live` against each local lab tier.

| Tier | Epitón protocol | Proteus oracle | Browser CRUD |
|------|------------------|----------------|--------------|
| Tryton 7.0 | 21 pass / 0 fail | 4 pass / 0 fail | pass |
| Tryton 8.0 | 20 pass / 0 fail | 4 pass / 0 fail | pass |

Notable passes: login, preferences, party tree/form views, search_read/count,
default_get, create/write/read/copy/export/delete, act_window Parties, strict
menus plus server-owned favorites, attachments search, form_relate keywords,
logout. The current Tryton 7 run additionally discovers a metadata-requested
`party.identifier` child boundary and accepts its transient `on_change_with` +
`pre_validate` path. The Tryton 8 figure is the prior green snapshot; the new
deep relation check has not been generalized to that series.

Notable lab limits (not Epitón defects): no `party.party` graph view; no board
views in stock party/company lab image; unauthenticated server version empty.

Offline: `tests/compat` — **14/14** tests passed (fixtures + Session header +
PYSON + O2M/M2M + board/graph parse).

## Architectural differences (intentional)

1. **UI toolkit** — React/Tailwind/`@epiton/ui` instead of jQuery Sao.
2. **Gateway** — required for production web (CSP, rate limit, input guards,
   optional deny-only strict ACL guard).
3. **Intelligence** — local search/suggestions; never auto-writes.
4. **Analytics** — client charts over `search_read` (≤500 rows), not a warehouse.
5. **Client boundary** — authentication, connection, backend projections,
   identifiers, domains, navigation, layout, and preferences remain in process
   memory and are purged at authentication/lifecycle boundaries.

This is an Epitón hardening advantage at the client boundary: strict response-id
correlation, no durable business-state copy, and no identifiers in URL/history,
while trytond remains the same authority. It is not a claim that upstream Tryton
or Sao is insecure, nor a substitute for closing the remaining Sao UX gaps.

## Remaining gaps vs Sao (priority)

See the full “Tryton still ahead” analysis: [`TRYTON_AHEAD.md`](TRYTON_AHEAD.md).
Evening re-audit: [`AUDIT.md`](AUDIT.md#epitón-audit-delta--2026-07-31-evening).

1. ~~Deeper embedded board act_window hosts (tree inside pane).~~
2. ~~Graph/`_actions` cross-filtering between board panes.~~
3. ~~Editable tree (`editable` arch).~~
4. ~~Hierarchical trees, saved searches, notebook tabs, translation wiring.~~
5. ~~Wizard final-execute/validate; bus → open/invalidate; richer reports.~~
6. GNU Health module depth — only after a pinned GH trytond is attached (`pnpm gh:check`).
7. Full nested Screen lifecycle: the parent command queue is improved, while
   child validation/navigation/cancel bubbling remains incomplete (**G-01**).
8. Dense form layout (`paned`/`colspan`/expansion) and a multi-clause domain
   builder beyond field-aware search plus saved filters (**G-05 / G-06**).
9. Targeted browser evidence: ~~relation-heavy forms~~ (L1.1) and ~~board Open~~
   (L1.2) closed; **wizard/report hosts (L1.3)** and **calendar mutations (L1.4)**
   remain open. Mock suite now includes `board.spec.ts`.

## Conclusion

Against Tryton 7 and 8 lab RPC, Epitón’s Session client and core model/action
paths are **compatible and verified**. Missing board/graph *data* in the stock lab
does not block hosts already implemented in the UI. Treat remaining Sao feature
depth as product backlog, not protocol breakage. REST Bearer stays **Not probed**.
Do not claim PHI/HIS readiness.
