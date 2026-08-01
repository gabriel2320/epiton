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
3. **Full nested Screen lifecycle:** Epitón's parent queue saves O2M/M2M without
   Apply, but nested hosts still lack Sao's complete validation/navigation bubbling

Recently improved (2026-07-31 cont. 8): saved-filter dialogs, email CC/BCC,
binary MIME/filename, tree sum/average footers, and a parent-owned Screen queue
with record-isolation guards; plus attachments depth, graph operators, ↑/↓ nav.

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
16. ~~Screen host + parent O2M/M2M command-queue~~ (view-engine `ScreenState` + ModelWorkspace); GTK-only plugins remain out of scope; live nested Sao Screens remain Medium polish
17. Lab smoke checklist in [`AUDIT.md`](AUDIT.md); REST Not probed; no PHI claims

## Prioritized client-depth batches — 2026-Q3/Q4

This section orders the unresolved gaps in this comparison; it is not a second
roadmap or status authority. Durable parity status stays in
[`COMPATIBILITY.md`](COMPATIBILITY.md), point-in-time evidence in
[`AUDIT.md`](AUDIT.md), gates in [`AGENT_LOOP.md`](AGENT_LOOP.md), and temporary
agent ownership in [`AGENT_BRIDGE.md`](AGENT_BRIDGE.md).

### Priority decisions

- **Do not rebuild Screen or Board from zero.** Parent-owned relation commands,
  record-isolation guards, and tree/graph/form board panes are already
  `Improved`.
- **Evidence comes first.** The 19/19 live receipt proves the wire, not deep
  browser behavior. Relation queues, board actions, wizards, reports, and
  calendars need deterministic browser scenarios.
- **Reduce the workspace hotspot before adding more UI state.**
  `ModelWorkspace.tsx` is about 2,000 lines and currently concentrates list,
  record, action, calendar, search, and relation behavior.
- **Nested Screen and dense form layout are the main client-depth gaps.** A
  multi-clause filter builder is valuable, but the existing field-aware search
  and saved filters keep it behind those two gaps.
- Board wizard/report panes still hand off to the shell. Closing that placeholder
  is useful polish, not the leading protocol or workflow blocker.
- REST Bearer, GTK-only plugins, PHI/HIS claims, and Proteus in the product
  runtime are outside this plan. Proteus remains an isolated lab oracle.

### Suggested delivery batches

Effort is relative and is not a calendar promise. The current Screen baseline
and its exact support level are recorded in `COMPATIBILITY.md`; the batches below
start with evidence for that behavior instead of reopening its implementation.

| Lot | Outcome and scope | Depends on | Verifiable exit | Effort / risk |
|-----|-------------------|------------|-----------------|---------------|
| **L1 — Browser depth evidence** | Keep deterministic coverage for relation queue + parent save and A→B stale-read/write isolation; add board action open, wizard/report shell paths, and calendar create/move. The mock gateway is the hard gate; extend live-lab scenarios only where stock Tryton 7/8 exposes the required metadata/model. | Current Screen baseline | The relation/isolation scenarios and each new scenario pass in `pnpm test:e2e:mock`; applicable live scenarios pass on each series that exposes the feature; an absent stock board/calendar is recorded as a lab limitation, not a failed client gate. | M / Medium |
| **L2 — Decompose `ModelWorkspace`** | Extract record lifecycle/query, list selection/navigation, action toolbar, and search/view-mode concerns behind typed hooks/components without changing RPC shape or behavior. | Current Screen baseline; use L1 as regression net | No component created as another monolith; focused web tests plus unchanged L1 results; build and bundle stay within budget. | M–L / Medium |
| **L3 — Nested Screen lifecycle** | Give O2M/M2M line forms an explicit child Screen contract: validation, on_change propagation, navigation/cancel semantics, and command bubbling into one parent create/write. Freeze that view-engine API before handing off the web wiring; align or retire duplicate relation paths such as `PartyWorkspace`. | L1; L2 strongly preferred | Unit tests cover create/update/remove/cancel and nested validation; the API handoff is recorded before relation components change; one relation-heavy browser flow proves a single parent mutation; Tryton 7/8 RPC evidence remains green; `COMPATIBILITY.md` records the exact supported depth. | L / High |
| **L4 — Dense form layout** | Implement Sao-shaped `colspan`, expansion/alignment, and basic paned layout while preserving existing group/notebook state behavior and exclusive loading/error/empty/data states. | L1; can proceed beside L2/L3 only with separate path ownership | XML parse/render fixtures, responsive and keyboard checks, and representative screenshots or Playwright assertions at desktop/mobile widths. | M / Medium |
| **L5 — Domain filter builder** | Add typed AND/OR clauses, operators, values, validation, and round-trip to Tryton domains; keep raw JSON domain and saved filters interoperable. | L2 | Domain encode/decode unit tests; browser scenario builds, applies, saves, reloads, and deletes a filter; malformed clauses never issue an RPC. | M / Medium |
| **L6 — Board/action polish** | Replace the wizard/report placeholder by reusing the normal shell action host, then verify active ids/context. Do not create an embedded duplicate action runtime; deeper list-form/calendar pane work is a separately justified follow-up. | L1 and L2; schedule after L5 unless a failing workflow raises its priority | One board Playwright scenario proves wizard/report open through the shared host and preserves selection/context; existing tree/form/graph and sibling `_actions` tests remain green. | S–M / Medium |
| **L7 — Release and compatibility gate** | Run accessibility/performance budgets, document a focused threat model and production gateway checklist, and optionally attach a pinned disposable GNU Health lab for metadata/menu/view discovery. GNU Health evidence stays synthetic and read-only until separately governed. | L1–L5 for the core client-depth candidate; L6 gates only a release claiming that board polish; GH track may start earlier in isolation | Minimum gates below pass; strict production ACL/gateway defaults are explicit; `gh:check` and a receipt back only the exact GNU Health claim made; `AUDIT.md` is updated only through a new dated audit. | L / Medium–High |

L1 is delivered as atomic browser slices. The relation/isolation slice is
covered; the next claim is **board action open** through one shared shell route.
Wizard/report and calendar follow as separate slices so each commit expands one
mock fixture surface and has one unambiguous owner/reviewer handoff.

Recommended sequence:

```text
L1 ─► L2 ─► L3
 │      ├──► L5
 └────────► L4
L3 + L4 + L5 ─────► L7
             L5 ─► L6 (board-polish claim only)
```

L4 may run while L2/L3 advances only if the active owners do not overlap on
`ModelWorkspace.tsx`, `screen.ts`, or relation editor files.

### Batch rails

Every batch follows `AGENT_LOOP.md` and the product/governance rails in
`CANON.md` and `GOVERNANCE.md`. Changed parity is recorded in
`COMPATIBILITY.md`; Proteus remains supporting oracle evidence, never a runtime
dependency. Operational handoffs record one owner, one atomic diff, commands,
results, and unresolved risks in `AGENT_BRIDGE.md` without becoming durable
product assignments.

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
