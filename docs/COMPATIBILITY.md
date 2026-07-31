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
| Attachments | `ir.attachment` | Implemented | Scoped to selected `recordId` |
| O2M / M2M / M2O | field types in view engine | Implemented UI hooks | Nested editors |
| Binary | binary fields | Implemented | File upload/download (no `javascript:` URLs) |
| PYSON states | `invisible`/`readonly`/`required` | Partial | Eval/Not/Bool/Equal subset |
| Bus | `/{db}/bus` | Long-poll `BusClient` + shell banner | Capability probed |
| REST | Bearer application tokens | Not probed (default false) | Prefer gateway |
| Menu → model/wizard/report | `resolveAction` | Implemented | Tree menu + deep-link `?model=&id=` |
| CSP | Web security headers | Prod hardened | Prefer web→gateway so `connect-src 'self'` |
| Series 7.0 LTS | Docker lab image | Lab compose | |
| Series 8.x | Capability detect | `common.server.version` | |
| Sao coexistence | Same trytond | Supported | Do not share browser storage blindly |
| Proteus / XML-RPC | Server-side | Out of Epiton UI scope | |
| GNU Health | `health_*` modules | Matrix in `docs/GNU_HEALTH.md` | Phase 4 |

## Security deployment note

Recommended production topology: browser → **epiton-gateway** → trytond. Then production CSP can keep `connect-src 'self'` (same origin as the SPA or gateway reverse-proxy). Direct browser→trytond remains supported in development (`connect-src` allows http/https).

Session tokens must not be written to `localStorage` (only `epiton.connection` baseUrl/database).

## Fixtures

Synthetic traces live in `tests/compat/fixtures/`. Replay against a live lab with Epiton client when docker is up.
