# Epitón ↔ Tryton compatibility matrix

Canonical parity table. Authority and agent rails: [`CANON.md`](CANON.md),
[`GOVERNANCE.md`](GOVERNANCE.md), [`../AGENTS.md`](../AGENTS.md).
Live evidence vs Tryton lab: [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md) (`pnpm compat:live`).
Where Sao/GTK still lead: [`TRYTON_AHEAD.md`](TRYTON_AHEAD.md).

| Area | Tryton contract | Epiton status | Notes |
|------|-----------------|---------------|-------|
| JSON-RPC 1.0 | `/{db}/` (Tryton 7 docker) and `/{db}/rpc/` | Implemented (`@epiton/protocol`, auto-fallback) | |
| Session auth | `Authorization: Session` base64(login:uid:token) | Implemented | Memory-only on web, Tauri, and Capacitor; no token hydration |
| Login | `common.db.login` (+ `common.db.list`) | Improved | Password params; DB datalist when list exposed |
| Logout | `common.db.logout` | Implemented | |
| Model CRUD | `model.*.create/read/write/delete/search_read` | Implemented | Generic `ModelWorkspace` |
| Views | `fields_view_get` arch XML | Implemented | form/tree + list-form/calendar/graph/board hosts |
| Calendar | calendar arch + date fields | Improved | Arch dtstart/dtend/color + create/drag write-back; deterministic pointer proof covers success and rejected-write soft failure |
| Attachments | `ir.attachment` | Improved | Multi-upload + rename/description + MIME preview |
| Graph | graph arch | Improved | y operator sum/average/count + arch title |
| Editable tree | `editable` arch / inline write | Improved | selection/date/m2o + optional= + sum/average footers |
| O2M / M2M / M2O | field types in view engine | Improved | Parent Screen queue saves without Apply; nested hosts remain local; M2M delta |
| Revision history | `model.__history__` | Improved | Diff vs draft + resolve write_uid; strip create_* on restore |
| Notebook | form notebook pages | Improved | Exclusive tabs + remembered page |
| Buttons | view `button` + confirm | Improved | Method RPC with `active_ids`; `type=action` → resolveAction |
| Wizards | `wizard.*.create/execute/delete` | Improved | End-state execute + validate + on_change + M2O search; board→shared Shell mock proof preserves action context |
| Reports | `report.*.execute` | Improved | Formats + pdfjs + `ir.action.report` picker; board→shared Shell mock proof preserves action context |
| Binary | binary fields | Improved | MIME + filename= sibling; download uses real name |
| PYSON states | `invisible`/`readonly`/`required` | Improved | + Add/Sub/Mul/Div/Id; unknown → null |
| Domains | field / arch domain PYSON | Implemented | Evaluated for M2O search + O2M/M2M; screen filter bar |
| on_change | `on_change_*` / `on_change_with` | Implemented | Debounced in `ModelWorkspace` |
| Action stack | nested related records | Implemented | Breadcrumbs + Back in Shell |
| Workspace tabs | multi-tab actions | Implemented | Independent stacks per tab; Ctrl/Cmd+favorite opens new |
| CSV export | `export_data` / `export_data_domain` | Improved | Field picker dialog before export |
| CSV import | `import_data` | Improved | Header mapping dialog → typed cells |
| Saved searches | `ir.ui.view_search` | Improved | Load/apply + dialog save/delete (no prompt) |
| Board | board arch + actions | Improved | Tree/graph/form + multi-y + `_actions` cross-filter; act_window/wizard/report Open reuse Shell and preserve active selection/context (mock browser proof) |
| Hierarchical tree | TreeMixin / `parent` / `field_childs` | Improved | Expand + lazy + tree_state(domain) + sequence DnD |
| Shell hosts | Tauri / Capacitor | Beta | Title/safe-area; memory-only sessions; legacy preference slots erased |
| Server favorites | `ir.ui.menu.favorite` | Improved | Sidebar + star toggle; preset fallback |
| Email compose | mailto / form_action keywords | Improved | CC/BCC + keyword-first mailto fallback |
| Translations | `ir.translation` catalog | Improved | Catalog + `t()` labels + Shell/workspace chrome |
| List-form | list-form arch | Improved | Card host renders list-form arch via `renderView` |
| Form widgets | reference/dict/timedelta/url/email/password/progressbar/note | Improved | Reference model select + Open; URL blocks javascript: |
| Preferences | `get_preferences` / `set_preferences` | Improved | Server form + M2O RelationSearch; no fake arch |
| act_window | domain/context/views | Improved | Polymorphic `ir.action,{id}`; views/domain/context eval |
| Screen host | act_window lifecycle + relation queue | Improved | Explicit hydrate lifecycle; pristine `default_get`; A→B/generation + last-request-wins guards; Save flushes/awaits pending `on_change`; parent save via `screenValuesForSave`; deterministic browser proof for queued O2M → one parent write and late-A isolation from B writes |
| Screen search | user domain / ilike | Improved | Field-aware ilike over tree char columns |
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
| REST | Bearer application tokens | Not probed (default false) | Do not claim compatibility |
| Menu → model/wizard/report | `resolveAction` | Implemented | Tree menu + deep-link `?model=&id=` |
| CSP | Web security headers | Prod hardened | Production web is pinned to a same-origin gateway with `connect-src 'self'` |
| Series 7.0 LTS | Docker lab image | Supported tier | CI protocol 19/19 + Proteus oracle 4/4 + browser CRUD |
| Series 8.x | Docker lab image + RPC fallback | Supported tier | CI protocol 19/19 + Proteus oracle 4/4 + browser CRUD; separate Postgres volume |
| Sao coexistence | Same trytond | Supported | Do not share browser storage blindly |
| Proteus / XML-RPC | Server-side reference client | Lab oracle only | Exact 7/8 pins; synthetic CRUD; redacted receipt; never runtime/UI |
| GNU Health | `gnuhealth.*` models | Metadata-only discovery contract | No business-row reads or writes; dedicated GH lab still required |

## Tryton 8 lab profile

Default compose starts **Tryton 7.0**. Series 8 is a supported CI tier with an
isolated database and gateway:

```bash
pnpm lab:up:8          # db8 + tryton8 (:8001) + gateway8 (:8081)
# Login database: epiton_lab8
pnpm lab:oracle:8      # pinned Proteus reference oracle
pnpm lab:down          # tears down default + tryton8 profile
```

`detectCapabilities()` still classifies `8.x` via `common.server.version`.

## Security deployment note

Required production-web topology: browser → same-origin reverse proxy →
**epiton-gateway** → trytond. Production CSP keeps `connect-src 'self'`, and the
login server field is locked to that origin. Direct browser→trytond remains a
development-only mode; native beta shells may use an explicitly configured
endpoint.

Session tokens must not be written to `localStorage`, `sessionStorage`, Tauri
Store, or Capacitor Preferences. Connection preferences are non-secret;
production web ignores any stored `baseUrl`.

## Fixtures

Synthetic traces live in `tests/compat/fixtures/`. Offline replay:
`pnpm --filter @epiton/compat test`. Live matrix against docker lab:
`pnpm compat:live` (see [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md)). The browser
boundary is covered by `pnpm test:e2e:mock` and the disposable lab by
`EPITON_E2E_LAB=disposable pnpm test:e2e:live`.
