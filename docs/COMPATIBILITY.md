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
| Views | `fields_view_get` arch XML | Implemented | form/tree + list-form/calendar/graph/board hosts; ordered action views start on the first supported list host, unknown kinds fall back to tree |
| Calendar | calendar arch + date fields | Improved | Arch dtstart/dtend/color + create/drag write-back; deterministic pointer proof covers success and rejected-write soft failure |
| Attachments | `ir.attachment` | Improved | Multi-upload + rename/description + MIME preview; the shared Shell drawer owns record scoping and entry |
| Graph | graph arch | Improved | y operator sum/average/count + arch title |
| Editable tree | `editable` arch / inline write | Improved | selection/date/m2o + optional= + sum/average footers |
| O2M / M2M / M2O | field types in view engine | Improved | Shared web relation hosts consume the frozen child Screen contract for create/write/remove/cancel/validation, latest-response guards, x2many replacement/patch translation, and metadata-driven server `pre_validate`; M2M preserves nested commands plus membership delta. Deterministic O2M and M2M receipts each prove one parent write with no child mutation; the M2M wire is exactly add `22` / remove `20`. A Tryton 7 live metadata receipt qualifies transient child `on_change_with` + `pre_validate`; broader third-party/series depth is not claimed |
| Revision history | `model.__history__` | Improved | Diff vs draft + resolve write_uid; strip create_* on restore |
| Notebook | form notebook pages | Improved | Exclusive tabs + process-local current page |
| Buttons | view `button` + confirm | Improved | Method RPC with canonical `active_id(s)` context; `type=action` → shared resolveAction host; typed toolbar policy is shared by list/tree/record paths |
| Wizards | `wizard.*.create/execute/delete` | Improved | End-state execute + validate + on_change + M2O search; board→shared Shell mock proof preserves action context |
| Reports | `report.*.execute` | Improved | Formats + pdfjs + `ir.action.report` picker; board→shared Shell mock proof preserves action context |
| Binary | binary fields | Improved | MIME + filename= sibling; download uses real name |
| PYSON states | `invisible`/`readonly`/`required` | Improved | + Add/Sub/Mul/Div/Id; unknown → null |
| Domains | field / arch domain PYSON | Implemented | Evaluated for M2O search + O2M/M2M; screen filter bar |
| on_change | `on_change_*` / `on_change_with` | Implemented | Debounced parent and child paths; relation-shaped replacement/patch responses enter x2many queues with generation/revision stale-response guards; Tryton 7 live evidence covers a transient `party.identifier` child and metadata-derived dependents |
| Action stack | nested related records | Implemented | Breadcrumbs + Back in Shell |
| Workspace tabs | multi-tab actions | Implemented | Independent stacks per tab; Ctrl/Cmd+favorite opens new |
| CSV export | `export_data` / `export_data_domain` | Improved | Field picker dialog before export |
| CSV import | `import_data` | Improved | Header mapping dialog → typed cells |
| Saved searches | `ir.ui.view_search` | Improved | Typed controls load/apply + dialog save/delete through the workspace-owned RPC path (no prompt) |
| Board | board arch + actions | Improved | Tree/graph/form + multi-y + `_actions` cross-filter; act_window/wizard/report Open reuse Shell and preserve active selection/context (mock browser proof) |
| Hierarchical tree | TreeMixin / `parent` / `field_childs` | Improved | Expand + lazy + tree_state(domain) + sequence DnD |
| Shell hosts | Tauri / Capacitor | Beta | Title/safe-area; memory-only sessions; legacy preference slots erased; Android project and CI APK/Tauri bundle producers are defined, first green artifact receipts pending |
| Server menus/favorites | `ir.ui.menu` + `ir.ui.menu.favorite.get/set/unset` | Improved | Strict server rows/tuples; sidebar + star toggle; no fabricated fallback or menu-record write |
| Email compose | mailto / form_action keywords | Improved | CC/BCC + keyword-first mailto fallback |
| Translations | `ir.translation` catalog | Improved | Catalog + `t()` labels + Shell/workspace chrome |
| List-form | list-form arch | Improved | Card host renders list-form arch via `renderView` |
| Dense form layout | form/group/notebook/paned arch | Improved | Neutral layout parsing covers col/colspan/rowspan, expand/fill/alignment, newline, expandable groups, and positioned horizontal/vertical panes; mounted notebook panels preserve nested state; desktop/mobile Chromium assertions prove responsive containment and keyboard tabs |
| Form widgets | reference/dict/timedelta/url/email/password/progressbar/note | Improved | Reference model select + Open; URL blocks javascript: |
| Preferences | `get_preferences` / `set_preferences` | Improved | Server form + M2O RelationSearch; no fake arch |
| act_window | domain/context/views | Improved | Polymorphic `ir.action,{id}`; views/domain/context eval |
| Screen host | act_window lifecycle + relation queue | Improved | Explicit parent/child hydrate lifecycle; pristine `default_get`; A→B/generation + last-request-wins guards; Save/Accept flush pending `on_change`; parent save via `screenValuesForSave`; deterministic browser proof covers O2M queued create+edit and M2M membership add/remove as one parent write with no child mutation. Tryton 7 live metadata proves the transient child `on_change_with` / `pre_validate` boundary; late-A isolation from B writes remains covered. Nested lifecycle: [`CHILD_SCREEN_CONTRACT.md`](CHILD_SCREEN_CONTRACT.md) |
| Screen search | user domain / ilike | Improved | Pure composition preserves action + selected-tab + field-aware search domains |
| Server order | column sort | Implemented | `name ASC` via search_read order |
| defaults | `default_get` | Implemented | On New |
| Copy | `model.*.copy` | Implemented | Selected ids → new records |
| Keywords | `ir.action.keyword.get_keyword` | Improved | Relate/Print/Action + tree_open/graph_open |
| URL actions | `ir.action.url` | Implemented | Opens external URL (blocks `javascript:`) |
| Domain tabs | `ir.action.act_window.domain` | Improved | Typed named tabs + count badges; selected PYSON domain is evaluated in volatile context and selection is process-local |
| Page size | client limit | Implemented | 40/80/120/200 selector |
| Audit meta | create/write date+uid | Implemented | `MetaStrip` under form toolbar |
| Shortcuts | Ctrl/Cmd+S Esc T W | Implemented | Save / read / new tab / close tab |
| UI kit | `@epiton/ui` | Expanded | Input, Badge, Tabs, Separator, MetaStrip, Alert, ConfirmDialog |
| Notices | status banners | Implemented | `Alert` tones; delete uses `ConfirmDialog` |
| Bus | `/{db}/bus` | Improved | user+client channels; title/message; auto-open record payloads; authenticated 401 invalidates the session boundary |
| REST | Bearer application tokens | Not probed (default false) | Do not claim compatibility |
| Menu → model/wizard/report | `resolveAction` | Implemented | Tree menu + in-app navigation; backend identifiers stay out of URL/history |
| CSP | Web security headers | Prod hardened | Production web is pinned to a same-origin gateway with `connect-src 'self'`; Next adds a per-request script nonce plus `strict-dynamic`, proved in a production browser |
| Next.js App Router host | Same Epitón application and contracts | N1 partial | Build and 14-scenario production E2E/CSP/PWA receipt pass; first green CI APK and Tauri bundle receipts remain before the N2 web cutover |
| Series 7.0 LTS | Docker lab image | Supported tier | Live protocol 21/21, including transient relation-child boundary + Proteus oracle 4/4 + browser CRUD |
| Series 8.x | Docker lab image + RPC fallback | Supported tier | CI protocol 20/20 + Proteus oracle 4/4 + browser CRUD; separate Postgres volume |
| Series 9.x | Future official artifacts + capability probes | Future canary, not claimed | Scheduled official-source canary is `waiting` as of 2026-08-01; do not infer support from 7/8 receipts |
| Sao coexistence | Same trytond | Supported | Shared backend authority; Epitón does not share or persist client state |
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

`detectCapabilities()` records the observed `X.Y` series via
`common.server.version`; this discovery value is not a compatibility claim.

## Series support policy

Epitón targets capabilities, then proves concrete series. Tryton 7.0 and 8.x
are the only supported tiers in the current lab. The machine-readable policy is
[`config/tryton-series-policy.json`](../config/tryton-series-policy.json).
Tryton 9 remains a future canary until official server and Proteus packages,
documentation, and a container exist, then the protocol, Proteus reference
oracle, and browser matrix all pass. Version-specific branches must be based on
an observed contract delta rather than a guessed major number.

`pnpm tryton:canary:9` checks those four official upstream sources and emits a
redacted JSON receipt. The scheduled
[`tryton-upstream-canary.yml`](../.github/workflows/tryton-upstream-canary.yml)
runs with `--fail-on-release`: a coherent official release makes the workflow
red so an agent must add the 9.0 lab lane. It never edits the support policy or
promotes compatibility automatically. On 2026-08-01 all four probes returned
HTTP 404, so the receipt state was `waiting` and `supportClaim` remained false.

## Security deployment note

Required production-web topology: browser → same-origin reverse proxy →
**epiton-gateway** → trytond. Production CSP keeps `connect-src 'self'`, and the
login server field is locked to that origin. Direct browser→trytond remains a
development-only mode; native beta shells may use an explicitly configured
endpoint.

Authentication, connection details, RPC data, backend/model/record identifiers,
domains, drafts, navigation, layout, and preferences must not be written to
`localStorage`, `sessionStorage`, IndexedDB, cookies, Cache Storage, Tauri Store,
Capacitor Preferences, or URL/history. They are process-memory projections and
are purged on logout, authenticated 401, and page lifecycle teardown. Legacy
adapters are deletion-only. RPC and bus requests use `no-store`, omit ambient
credentials and suppress referrers; the PWA cache contains static build assets
only.

## Fixtures

Synthetic traces live in `tests/compat/fixtures/`. Offline replay:
`pnpm --filter @epiton/compat test`. Live matrix against docker lab:
`pnpm compat:live` (see [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md)). The browser
boundary is covered by `pnpm test:e2e:mock`; the production Next host, its
nonce-based CSP, installable manifest, and static-only Cache Storage allowlist
by `pnpm test:e2e:next`; and the disposable lab by
`EPITON_E2E_LAB=disposable pnpm test:e2e:live`.
