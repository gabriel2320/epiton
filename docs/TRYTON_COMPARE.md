# Epitón vs Tryton — comparison & compatibility evidence

Date: **2026-07-31**. Target lab: Tryton **7** docker (`epiton_lab` @ `http://127.0.0.1:8000`).
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
| Menus `ir.ui.menu` | Yes | Yes | PASS (4 roots) |
| Keywords `get_keyword` | Yes | Yes | PASS (relate) |
| Attachments model | Yes | Yes | PASS (search) |
| Bus endpoint | Yes | Client + panel | `supportsBus: true` |
| Graph arch on party | Often module-specific | Host ready | Lab: no party graph view |
| Board views | Dashboard modules | Host ready | Lab: no board views installed |
| Unauth `common.server.version` | Varies | Soft probe | Lab returns empty/401 pre-login |
| Full embedded Sao board screens | Yes | Partial (analytics panes) | Product gap A-02 |
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
```

Receipt path (gitignored): `tests/compat/receipts/compat-live-latest.json`.

CI already runs lint/test/build + `lab:smoke:live` via `.github/workflows/ci.yml`.

## Live run snapshot (2026-07-31)

Command: `pnpm compat:live` against local `epiton/tryton-lab:7.0`.

| Result | Count |
|--------|-------|
| PASS | 19 |
| FAIL | 0 |
| SKIP | 0 |

Notable passes: login, preferences, party tree/form views, search_read/count,
default_get, create/write/read/copy/export/delete, act_window Parties,
menus, attachments search, form_relate keywords, logout.

Notable lab limits (not Epitón defects): no `party.party` graph view; no board
views in stock party/company lab image; unauthenticated server version empty.

Offline: `tests/compat` — **10/10** tests passed (fixtures + Session header +
PYSON + O2M/M2M + board/graph parse).

## Architectural differences (intentional)

1. **UI toolkit** — React/Tailwind/`@epiton/ui` instead of jQuery Sao.
2. **Gateway** — optional Axum proxy (CSP, rate limit, strict ACL coach).
3. **Intelligence** — local search/suggestions; never auto-writes.
4. **Analytics** — client charts over `search_read` (≤500 rows), not a warehouse.
5. **Storage** — session token in memory (web) / OS store (desktop); only
   connection prefs in `localStorage`.

## Remaining gaps vs Sao (priority)

See the full “Tryton still ahead” analysis: [`TRYTON_AHEAD.md`](TRYTON_AHEAD.md).

1. Deeper embedded board act_window hosts (tree inside pane).
2. ~~Graph/`_actions` cross-filtering between board panes.~~
3. Editable tree (`editable` arch).
4. Hierarchical trees, saved searches, notebook tabs, translation wiring.
5. Wizard final-execute/validate; bus → open/invalidate; richer reports.
6. Probe Tryton 8 lab (`pnpm lab:up:8`) in the same `compat:live` flow.
7. GNU Health models — only when a GH trytond is attached (`pnpm gh:check`).

## Conclusion

Against Tryton 7 lab RPC, Epitón’s Session client and core model/action paths
are **compatible and verified**. Missing board/graph *data* in the stock lab
does not block hosts already implemented in the UI. Treat Sao feature depth
gaps as product backlog, not protocol breakage.
