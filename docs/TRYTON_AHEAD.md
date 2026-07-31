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

1. **Full board embedding** (real screens inside panes)
2. **Board `_actions` cross-filtering**
3. **Editable trees**
4. **Hierarchical tree expand / group-by**
5. **Saved searches & server favorites**
6. **Notebook UX** (true tabs vs accordion)
7. **Translation catalog wiring** for client chrome
8. **Wizard edge cases** (final execute / validate)
9. **Bus → open record / invalidate**
10. **Native desktop/mobile depth** (GTK / device shells)

## P0 — Workflow blockers vs Sao dashboards & lists

| Area | What Sao/GTK does | What Epitón does today | Gap | Evidence |
|------|-------------------|-------------------------|-----|----------|
| **Board embedding** | Each board `<action>` hosts a live act_window (tree/form/graph) in-pane | Analytics preview (count + chart + Open); navigating leaves the board | Large | `BoardPane.tsx`, audit A-02 |
| **`_actions` cross-filter** | Click graph/list selection filters sibling panes | Panes are isolated; no shared selection domain | Medium | `TRYTON_COMPARE.md`, audit A-03 |
| **Editable tree** | `editable="top\|bottom"` inline cell edit + writes | Tree is read-only virtual table; edit only in form mode | Large | `VirtualPartyTable.tsx`, no `editable` in parse |

## P1 — Daily UX & deployment parity

| Area | What Sao/GTK does | What Epitón does today | Gap | Evidence |
|------|-------------------|-------------------------|-----|----------|
| **Notebook** | Exclusive tabs, remembered page, icons/states | `<details>` accordion (`open={i===0}`); multi-open possible | Medium | `view-engine/src/render.tsx` notebook |
| **Saved filters** | `ir.ui.view_search` named domains per model/user | Ad-hoc ilike / JSON domain bar only | Medium | No `view_search` usage in repo |
| **Server favorites / bookmarks** | Persisted user shortcuts on server | Local intelligence presets + in-memory history | Medium | `intelligence` presets; Shell favorites |
| **Translations** | Lang-aware strings via trytond / catalogs | Login `lang` sent; shell i18next static; `setCatalog` not wired from web | Medium | `view-engine/src/i18n.ts` unused by web |
| **Reports** | Broader formats + print pipeline | `pdf`/`odt`/`csv`; iframe preview; pdfjs mostly unused | Medium | `ReportDownload.tsx`, audit A-06 |
| **Wizards** | Validate flags, icons, robust end-state execute | Create/execute/delete drawer; thin end-state / no button validate | Medium | `WizardStepper.tsx`, `wizards.ts` |
| **Domain builder UI** | Per-field filter widgets / visual domain | Domain **tabs** + JSON/ilike bar (tabs are strong; builder is not) | Medium | `ModelWorkspace` search |
| **Hierarchical trees** | Parent/child expand, account/menu trees | Flat `search_read` lists | Large | No parent-tree host |
| **Tree group-by / header limits** | Group rows, arch limit semantics | Page size only | Medium | List host |
| **Bus depth** | Notify → refresh / open document | Long-poll panel for `user:{uid}`; string notices | Medium | `BusBanner.tsx` |
| **Mobile / desktop shells** | GTK native; mature Sao desktop habits | Thin Tauri/Capacitor wrappers around web | Large | audit A-05 |

## P2 — Polish / niche

| Area | What Sao/GTK does | What Epitón does today | Gap |
|------|-------------------|-------------------------|-----|
| Attachment drag-and-drop | Drop files onto record | File input only | Small |
| Email compose | Record email wizards / SMTP flows | `mailto` / email widget | Medium |
| CSV column mapping UI | Map headers → fields before import | Assumes header = field name | Medium |
| Revision / history browser | Browse `__history__` / revisions | `MetaStrip` create/write meta only | Medium |
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

1. **Embed tree (or list-form) inside `BoardPane`** for `kind: "model"` actions — largest Sao delta.
2. **Wire pane selection → sibling domains** (`_actions`-style) once embedding exists.
3. **Editable tree** from arch `editable` + row `write`.
4. **Notebook → real tabs**; **`ir.ui.view_search`** + optional server favorites.
5. **Wizard final-execute/validate**; **bus → invalidateQueries / open id**.
6. Wire **translation catalog** from preferences language for shell fallbacks.

## How to re-check

```bash
pnpm --filter @epiton/compat test   # offline contracts
pnpm compat:live                    # live RPC (does not measure UI depth)
```

UI-depth gaps above require manual Sao side-by-side or future Playwright scenarios;
RPC green ≠ Sao feature parity.
