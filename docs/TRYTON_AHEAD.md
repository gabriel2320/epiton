# Where Tryton (Sao/GTK) still surpasses Epitón

Date: **2026-07-31**. Companion to [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md)
(live RPC evidence) and [`COMPATIBILITY.md`](COMPATIBILITY.md) (status matrix).

**Frame:** Epitón already matches Tryton on the **Session wire** and core
CRUD/views/actions (see `pnpm compat:live`). The gaps below are **client depth**
and **Sao UX**, not a broken protocol. trytond remains the system of record in
both worlds.

```text
Tryton wins on depth ──► Sao/GTK mature workflows
Epitón wins on platform ──► React/Tauri/gateway, analytics overlays, Apache-2.0 client
Shared truth ──► trytond JSON-RPC
```

## Executive shortlist

Tryton is still clearly ahead on:

1. **Full GTK / device-native chrome** (print plugins, deep OS integration)
2. SMTP pipeline depth when modules expose custom mail wizards not matched by keywords
3. Nested O2M/M2M still command-queue on parent save (queued creates now visible as rows; not live Sao Screen)

Recently improved (2026-07-31 cont. 8): saved-filter dialogs, email CC/BCC,
binary MIME/filename, tree sum/average footers;
plus attachments depth, graph operators, ↑/↓ nav.

## P0 — Workflow blockers vs Sao dashboards & lists

| Area | What Sao/GTK does | What Epitón does today | Gap | Evidence |
|------|-------------------|-------------------------|-----|----------|
| **Board embedding** | Each board `<action>` hosts a live act_window (tree/form/graph) in-pane | **Improved:** tree/graph/form + multi-y graphs | Small | `BoardPane.tsx`, `RecordFormPane.tsx` |
| **`_actions` cross-filter** | Click graph/list selection filters sibling panes | **Improved:** `_actions` dict + `active_id`; relation heuristics as fallback | Small | `BoardWorkspace` / `BoardPane` |
| **Editable tree** | `editable="top\|bottom"` inline cell edit + writes | **Improved:** selection/date/m2o cells + New row | Small | `VirtualPartyTable.tsx` |
| **Hierarchical tree** | Parent expand via TreeMixin / `field_childs` | **Improved:** flatten + lazy fetch + tree_state(+domain) + sequence DnD | Small | `tree_hierarchy.ts`, `tree_state.ts` |
| **Notebook** | Exclusive tabs, remembered page, icons/states | **Improved:** exclusive tabs + sessionStorage page memory | Small | `render.tsx` `NotebookHost` |
| **Saved filters** | `ir.ui.view_search` named domains per model/user | **Improved:** load/apply/save/delete via protocol helper | Small | `view_search.ts`, ModelWorkspace |
| **Server favorites / bookmarks** | Persisted user shortcuts on server | **Improved:** `ir.ui.menu.favorite` + star toggle; preset fallback | Small | `Shell.tsx`, `MenuTree.tsx` |
| **Translations** | Lang-aware strings via trytond / catalogs | **Improved:** catalog + `t()` labels + Shell/workspace chrome | Small | `i18n.ts`, `Shell.tsx` |
| **Reports** | Broader formats + print pipeline | **Improved:** formats + pdfjs + `ir.action.report` picker | Small | `ReportDownload.tsx` |
| **Wizards** | Validate flags, icons, robust end-state execute | **Improved:** end-state + validate + on_change + M2O search | Small | `WizardStepper.tsx` |
| **Bus depth** | Notify → refresh / open document | **Improved:** invalidate queries; open model#id from payload | Small | `BusBanner.tsx` |
| **Mobile / desktop shells** | GTK native; mature Sao desktop habits | **Improved:** memory-only session bridge + title/safe-area; thin hosts | Small–Medium | `secureSessionBridge.ts` |


## P2 — Polish / niche

| Area | What Sao/GTK does | What Epitón does today | Gap |
|------|-------------------|-------------------------|-----|
| Attachment drag-and-drop | Drop files onto record | **Improved:** multi-file drop + rename/description + preview | Small |
| Email compose | Record email wizards / SMTP flows | **Improved:** CC/BCC mailto + keyword-first | Small |
| CSV column mapping UI | Map headers → fields before import | **Improved:** mapping dialog before `import_data` | Small |
| Revision / history browser | Browse `__history__` / revisions | **Improved:** Diff vs draft + uid names + restore strip | Small |
| Board multi-y series | Multi-series in dashboard graphs | **Improved:** board pane uses `rowsToMultiSeries` | Small |
| Graph operators / title | y `operator` + arch string | **Improved:** sum/average/count + title in GraphView | Small |
| Tree column footers | `sum` / `average` on tree fields | **Improved:** sticky footer over loaded rows | Small |
| `tree_open` / `graph_open` | Keyword actions on open/select | **Improved:** double-click tree + graph select | Small |
| GTK-only plugins | Native print, desktop hooks | Out of scope by design (webview) | Large (intentional) |

## Where Epitón is already comparable or ahead

These are **not** Tryton wins — listed so the comparison stays honest:

| Area | Note |
|------|------|
| Session CRUD / act_window / keywords | Live `compat:live` 19/19 on Tryton 7 and 8 labs |
| Domain tabs + `search_count` badges | Implemented |
| Client analytics overlays | Boards/graphs aggregate `search_read` with insights |
| Gateway (CSP, rate limit, strict ACL coach) | Sao has no equivalent Axum edge |
| License posture | Apache-2.0 client; no Sao GPL copy |
| Modern UI kit / PWA path | React 19 + Tailwind 4 |

## Recommended close order

1. ~~Board embed / `_actions` / multi-y / form-in-pane / graph click filter~~
2. ~~Editable tree / notebook memory / wizard / bus / view_search / i18n / CSV / DnD / history~~
3. ~~Hierarchical tree / lazy / tree_state / sequence DnD / favorites / pdfjs / email~~
4. ~~Shell title + safe-area + fail-closed memory-only session bridge~~
5. ~~Richer `tree_state` domains; print ids; tree/graph_open~~
6. ~~Wizard on_change + calendar arch/write + board wizard/report open UX~~
7. ~~Form button action routing + attachment links + PYSON ops + `common.db.list`~~
8. ~~Polymorphic `ir.action`; O2M/M2M labels+deltas; button active_ids; bus depth; CSV export picker; domain-tab memory~~
9. ~~Tree buttons; editable m2o; New row; history peek/restore; line on_change~~
10. ~~Line-form M2O/buttons; real form/tree errors; list-form renderView; reference/url; prefs relations~~
11. ~~Relation tree+form split; nested O2M/M2M editors; M2M cmd preserve; relation badge count~~
12. ~~Queued create rows; editable selection/date; `t()` labels; history diff; wizard M2O~~
13. ~~Report picker; dirty form; workspace i18n; optional= columns; field-aware search~~
14. ~~Attachments depth; graph operators/title; ↑/↓ nav; drawer i18n~~
15. ~~Saved-filter dialogs; email CC/BCC; binary MIME/filename; tree footers~~
16. GTK-only plugins remain out of scope; full live Sao Screen / global command-queue remain Medium polish
17. Lab smoke checklist in [`AUDIT.md`](AUDIT.md); REST Not probed; no PHI claims

## How to re-check

```bash
pnpm --filter @epiton/compat test   # offline contracts
pnpm compat:live                    # live RPC for the selected lab tier
pnpm test:e2e:mock                  # deterministic browser boundary
EPITON_E2E_LAB=disposable pnpm test:e2e:live
```

The live browser check covers core CRUD, not the full UI-depth list above.
Those gaps still require targeted Playwright scenarios or manual Sao comparison;
RPC green does not imply complete Sao feature parity.
