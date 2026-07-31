# Epitón ↔ Tryton compatibility matrix

Canonical parity table. Authority and agent rails: [`CANON.md`](CANON.md),
[`GOVERNANCE.md`](GOVERNANCE.md), [`../AGENTS.md`](../AGENTS.md).
Live evidence vs Tryton lab: [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md) (`pnpm compat:live`).
Where Sao/GTK still lead: [`TRYTON_AHEAD.md`](TRYTON_AHEAD.md).

| Area | Tryton contract | Epiton status | Notes |
|------|-----------------|---------------|-------|
| JSON-RPC 1.0 | `/{db}/` (Tryton 7 docker) and `/{db}/rpc/` | Implemented (`@epiton/protocol`, auto-fallback) | |
| Session auth | `Authorization: Session` base64(login:uid:token) | Implemented | Web: memory only; Tauri/Capacitor: OS store via bridge |
| Login | `common.db.login` (+ `common.db.list`) | Improved | Password params; DB datalist when list exposed |
| Logout | `common.db.logout` | Implemented | |
| Model CRUD | `model.*.create/read/write/delete/search_read` | Implemented | Generic `ModelWorkspace` |
| Views | `fields_view_get` arch XML | Implemented | form/tree + list-form/calendar/graph/board hosts |
| Calendar | calendar arch + date fields | Improved | Arch dtstart/dtend/color + create/drag write-back |
| Attachments | `ir.attachment` | Improved | Data upload/download + link type + DnD |
| Graph | graph arch | Implemented | `fields_view_get` graph type; vbar/hbar/line/pie + aggregate insights |
| Editable tree | `editable` arch / inline write | Improved | Cell editors + selection/date + m2o + New row; tree buttons |
| O2M / M2M / M2O | field types in view engine | Improved | Queued create rows; tree+form; nested lines; M2M preserve |
| Revision history | `model.__history__` | Improved | Diff vs draft + resolve write_uid; strip create_* on restore |
| Notebook | form notebook pages | Improved | Exclusive tabs + remembered page |
| Buttons | view `button` + confirm | Improved | Method RPC with `active_ids`; `type=action` → resolveAction |
| Wizards | `wizard.*.create/execute/delete` | Improved | End-state execute + validate + on_change + M2O search |
| Reports | `report.*.execute` | Improved | pdf/odt/csv/xls/html + pdfjs page/zoom; analytics companion |
| Binary | binary fields | Implemented | File upload/download (no `javascript:` URLs) |
| PYSON states | `invisible`/`readonly`/`required` | Improved | + Add/Sub/Mul/Div/Id; unknown → null |
| Domains | field / arch domain PYSON | Implemented | Evaluated for M2O search + O2M/M2M; screen filter bar |
| on_change | `on_change_*` / `on_change_with` | Implemented | Debounced in `ModelWorkspace` |
| Action stack | nested related records | Implemented | Breadcrumbs + Back in Shell |
| Workspace tabs | multi-tab actions | Implemented | Independent stacks per tab; Ctrl/Cmd+favorite opens new |
| CSV export | `export_data` / `export_data_domain` | Improved | Field picker dialog before export |
| CSV import | `import_data` | Improved | Header mapping dialog → typed cells |
| Saved searches | `ir.ui.view_search` | Improved | Load/apply/save/delete named domains |
| Board | board arch + actions | Improved | Tree/graph/form + multi-y + `_actions` cross-filter |
| Hierarchical tree | TreeMixin / `parent` / `field_childs` | Improved | Expand + lazy + tree_state(domain) + sequence DnD |
| Shell hosts | Tauri / Capacitor | Improved | Secure session hydrate/persist + title/safe-area |
| Server favorites | `ir.ui.menu.favorite` | Improved | Sidebar + star toggle; preset fallback |
| Email compose | mailto / form_action keywords | Improved | Prefer mail keywords; mailto fallback |
| Translations | `ir.translation` catalog | Improved | Login/prefs + view-engine `t()` on labels/buttons |
| List-form | list-form arch | Improved | Card host renders list-form arch via `renderView` |
| Form widgets | reference/dict/timedelta/url/email/password/progressbar/note | Improved | Reference model select + Open; URL blocks javascript: |
| Preferences | `get_preferences` / `set_preferences` | Improved | Server form + M2O RelationSearch; no fake arch |
| act_window | domain/context/views | Improved | Polymorphic `ir.action,{id}`; views/domain/context eval |
| Screen search | user domain / ilike | Implemented | Filter bar + JSON domain + pagination |
| Server order | column sort | Implemented | `name ASC` via search_read order |
| defaults | `default_get` | Implemented | On New |
| Copy | `model.*.copy` | Implemented | Selected ids → new records |
| Keywords | `ir.action.keyword.get_keyword` | Improved | Relate/Print/Action + tree_open/graph_open |
| URL actions | `ir.action.url` | Implemented | Opens external URL (blocks `javascript:`) |
| Domain tabs | `ir.action.act_window.domain` | Improved | Named tabs + count badges + sessionStorage memory |
| Page size | client limit | Implemented | 40/80/120/200 selector |
| Audit meta | create/write date+uid | Implemented | `MetaStrip` under form toolbar |
| Shortcuts | Ctrl/Cmd+S Esc T W | Implemented | Save / read / new tab / close tab |
| UI kit | `@epiton/ui` | Expanded | Input, Badge, Tabs, Separator, MetaStrip, Alert, ConfirmDialog |
| Notices | status banners | Implemented | `Alert` tones; delete uses `ConfirmDialog` |
| Bus | `/{db}/bus` | Improved | user+client channels; title/message; auto-open record payloads |
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

Synthetic traces live in `tests/compat/fixtures/`. Offline replay:
`pnpm --filter @epiton/compat test`. Live matrix against docker lab:
`pnpm compat:live` (see [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md)).
