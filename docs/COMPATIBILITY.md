# Epiton ↔ Tryton compatibility matrix

| Area | Tryton contract | Epiton status | Notes |
|------|-----------------|---------------|-------|
| JSON-RPC 1.0 | `/{db}/rpc/` | Implemented (`@epiton/protocol`) | Content-Type application/json |
| Session auth | `Authorization: Session` base64(login:uid:token) | Implemented | Secure storage on Tauri |
| Login | `common.db.login` | Implemented | Password params dict |
| Logout | `common.db.logout` | Implemented | |
| Model CRUD | `model.*.create/read/write/delete/search_read` | Implemented | Party workspace reference |
| Views | `fields_view_get` arch XML | Implemented | form/tree (+ stubs board/calendar/graph) |
| Buttons | view `button` + confirm | Implemented | |
| Wizards | `wizard.*.create/execute` | Probe host | Module-dependent |
| Reports | `report.*.execute` | Probe host | Module-dependent |
| Attachments | `ir.attachment` | Probe panel | |
| O2M / M2M / M2O | field types in view engine | Implemented UI hooks | Nested editors iterate |
| Bus | `/{db}/bus` | URL helper | Long-poll client TBD |
| REST | Bearer application tokens | Gateway pass-through | Optional |
| Series 7.0 LTS | Docker lab image | Lab compose | |
| Series 8.x | Capability detect | Detected via `common.server.version` | |
| Sao coexistence | Same trytond | Supported | Do not share browser storage blindly |
| Proteus / XML-RPC | Server-side | Out of Epiton UI scope | Still works against trytond |
| GNU Health | `health_*` modules | Matrix in `docs/GNU_HEALTH.md` | Phase 4 |

## Fixtures

Synthetic traces live in `tests/compat/fixtures/`. Replay against a live lab with Epiton client when docker is up.
