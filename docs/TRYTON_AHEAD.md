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

1. **Hierarchical tree expand / group-by**
2. **Native desktop/mobile depth** (GTK / device shells)
3. Deeper `_actions` XML (beyond active_id heuristics)
4. Richer report/pdfjs pipeline & email compose wizards

Recently improved (2026-07-31): board form-in-pane, `ir.ui.view_search`,
translation catalog wiring, attachment DnD, CSV column map, revision peek,
editable tree, notebook tabs, wizard end-execute/validate, bus invalidate/open.

## P0 — Workflow blockers vs Sao dashboards & lists

| Area | What Sao/GTK does | What Epitón does today | Gap | Evidence |
|------|-------------------|-------------------------|-----|----------|
| **Board embedding** | Each board `<action>` hosts a live act_window (tree/form/graph) in-pane | **Improved:** tree/graph + compact form-in-pane write; Open still escapes to full workspace | Small–Medium | `BoardPane.tsx`, `RecordFormPane.tsx` |
| **`_actions` cross-filter** | Click graph/list selection filters sibling panes | **Improved:** selection sets `active_id`/`active_model` context + relation-name heuristics for siblings | Medium | `BoardWorkspace` selection state |
| **Editable tree** | `editable="top\|bottom"` inline cell edit + writes | **Improved:** arch + Inline edit toggle; cell → `write` | Small–Medium | `VirtualPartyTable.tsx`, `treeEditable` |

## P1 — Daily UX & deployment parity

| Area | What Sao/GTK does | What Epitón does today | Gap | Evidence |
|------|-------------------|-------------------------|-----|----------|
| **Notebook** | Exclusive tabs, remembered page, icons/states | **Improved:** exclusive tab host | Small | `render.tsx` `NotebookHost` |
| **Saved filters** | `ir.ui.view_search` named domains per model/user | **Improved:** load/apply/save/delete via protocol helper | Small | `view_search.ts`, ModelWorkspace |
| **Server favorites / bookmarks** | Persisted user shortcuts on server | Local intelligence presets + in-memory history | Medium | `intelligence` presets; Shell favorites |
| **Translations** | Lang-aware strings via trytond / catalogs | **Improved:** login/prefs → `loadTranslationCatalog` + `setCatalog` | Small–Medium | `translations.ts`, `applyClientLanguage` |
| **Reports** | Broader formats + print pipeline | `pdf`/`odt`/`csv`; iframe preview; pdfjs mostly unused | Medium | `ReportDownload.tsx`, audit A-06 |
| **Wizards** | Validate flags, icons, robust end-state execute | **Improved:** end-state `execute` before delete; `validate` required fields | Small | `WizardStepper.tsx` |
| **Bus depth** | Notify → refresh / open document | **Improved:** invalidate queries; open model#id from payload | Small | `BusBanner.tsx` |
| **Mobile / desktop shells** | GTK native; mature Sao desktop habits | Thin Tauri/Capacitor wrappers around web | Large | audit A-05 |

## P2 — Polish / niche

| Area | What Sao/GTK does | What Epitón does today | Gap |
|------|-------------------|-------------------------|-----|
| Attachment drag-and-drop | Drop files onto record | **Improved:** dropzone on Attachments panel | Small |
| Email compose | Record email wizards / SMTP flows | `mailto` / email widget | Medium |
| CSV column mapping UI | Map headers → fields before import | **Improved:** mapping dialog before `import_data` | Small |
| Revision / history browser | Browse `__history__` / revisions | **Improved:** History button → read-only `__history__` peek | Small–Medium |
| Board multi-y series | Multi-series in dashboard graphs | Full graph mode supports multi-y; board pane uses first y | Small–Medium |
| GTK-only plugins | Native print, desktop hooks | Out of scope by design (webview) | Large (intentional) |

## Where Epitón is already comparable or ahead

These are **not** Tryton wins — listed so the comparison stays honest:

| Area | Note |
|------|------|
| Session CRUD / act_window / keywords | Live `compat:live` 19/19 on Tryton 7 lab |
| Domain tabs + `search_count` badges | Implemented |
| Client analytics overlays | Boards/graphs aggregate `search_read` with insights |
| Gateway (CSP, rate limit, strict ACL coach) | Sao has no equivalent Axum edge |
| License posture | Apache-2.0 client; no Sao GPL copy |
| Modern UI kit / PWA path | React 19 + Tailwind 4 |

## Recommended close order

1. ~~Embed tree inside `BoardPane`~~ + selection cross-filter + form-in-pane.
2. ~~Editable tree~~; ~~notebook tabs~~; ~~wizard end/validate~~; ~~bus open~~.
3. ~~`ir.ui.view_search`~~; ~~translation catalog~~; ~~CSV map~~; ~~attachment DnD~~; ~~history peek~~.
4. Hierarchical tree / group-by; server favorites; deeper `_actions` XML.
5. Report/pdfjs depth; email compose; thinner desktop/mobile shells.

## How to re-check

```bash
pnpm --filter @epiton/compat test   # offline contracts
pnpm compat:live                    # live RPC (does not measure UI depth)
```

UI-depth gaps above require manual Sao side-by-side or future Playwright scenarios;
RPC green ≠ Sao feature parity.
