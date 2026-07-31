# Epiton ↔ Tryton compatibility matrix

| Area | Tryton contract | Epiton status | Notes |
|------|-----------------|---------------|-------|
| JSON-RPC 1.0 | `/{db}/` (Tryton 7 docker) and `/{db}/rpc/` | Implemented (`@epiton/protocol`, auto-fallback) | |
| Session auth | `Authorization: Session` base64(login:uid:token) | Implemented | Secure storage on Tauri; web keeps token in memory only |
| Login | `common.db.login` | Implemented | Password params dict |
| Logout | `common.db.logout` | Implemented | |
| Model CRUD | `model.*.create/read/write/delete/search_read` | Implemented | Generic `ModelWorkspace` |
| Views | `fields_view_get` arch XML | Implemented | form/tree + calendar/graph hosts |
| Calendar | calendar arch + date fields | Implemented | FullCalendar over `search_read` |
| Graph | graph arch | Implemented | Recharts client-side (≤500 rows) |
| Buttons | view `button` + confirm | Implemented | Calls `model.<m>.<button>` |
| Wizards | `wizard.*.create/execute/delete` | Implemented | Sao-shaped data + drawer host |
| Reports | `report.*.execute` | Implemented | Download + iframe preview; `ir.action.report` resolve |
| Attachments | `ir.attachment` | Implemented | List + upload + download + delete |
| O2M / M2M / M2O | field types in view engine | Implemented UI hooks | Nested editors + M2M search-add |
| Binary | binary fields | Implemented | File upload/download (no `javascript:` URLs) |
| PYSON states | `invisible`/`readonly`/`required` | Implemented | JSON `__class__` + string Eval/Not/And/Or/If/Get/In/Date |
| Domains | field / arch domain PYSON | Implemented | Evaluated for M2O search + O2M/M2M; screen filter bar |
| on_change | `on_change_*` / `on_change_with` | Implemented | Debounced in `ModelWorkspace` |
| Action stack | nested related records | Implemented | Breadcrumbs + Back in Shell |
| act_window | domain/context/views | Implemented | Views by mode; domain/context eval with session prefs |
| Screen search | user domain / ilike | Implemented | Filter bar + JSON domain + pagination |
| Server order | column sort | Implemented | `name ASC` via search_read order |
| defaults | `default_get` | Implemented | On New |
| Form widgets | reference/dict/timedelta/url/email/password/progressbar | Partial | Core set beyond Sao MVP |
| Wizard actions | execute `actions` | Implemented | `wizardActionRefs` → openWorkspace |
| Bus | `/{db}/bus` | Long-poll `BusClient` + shell banner | Capability probed |
| REST | Bearer application tokens | Not probed (default false) | Prefer gateway |
| Menu → model/wizard/report | `resolveAction` | Implemented | Tree menu + deep-link `?model=&id=` |
| CSP | Web security headers | Prod hardened | Prefer web→gateway so `connect-src 'self'` |
| Series 7.0 LTS | Docker lab image | Default `pnpm lab:up` | CI smoke |
| Series 8.x | Capability detect + lab profile | `pnpm lab:up:8` → :8001 / gateway :8081 | Separate Postgres volume |
| Sao coexistence | Same trytond | Supported | Do not share browser storage blindly |
| Proteus / XML-RPC | Server-side | Out of Epiton UI scope | |
| GNU Health | `health_*` modules | Matrix in `docs/GNU_HEALTH.md` | Phase 4 |

## Tryton 8 lab profile

Default compose stays on **Tryton 7.0** (CI). Optional series 8:

```bash
pnpm lab:up:8          # db8 + tryton8 (:8001) + gateway8 (:8081)
# Login database: epiton_lab8
pnpm lab:down          # tears down default + tryton8 profile
```

`detectCapabilities()` still classifies `8.x` via `common.server.version`.

## Security deployment note

Recommended production topology: browser → **epiton-gateway** → trytond. Then production CSP can keep `connect-src 'self'` (same origin as the SPA or gateway reverse-proxy). Direct browser→trytond remains supported in development (`connect-src` allows http/https).

Session tokens must not be written to `localStorage` (only `epiton.connection` baseUrl/database).

## Fixtures

Synthetic traces live in `tests/compat/fixtures/`. Replay against a live lab with Epiton client when docker is up.
