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

## Joint development plan — 2026-Q3/Q4

This is the canonical forward plan agreed after a Codex/Cursor review of the
current code, tests, compatibility evidence, and Screen handoff. It does
not reopen the completed items above.

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

### Delivery lots

Effort is relative for one Codex/Cursor pair and is not a calendar promise.

| Lot | Outcome and scope | Depends on | Verifiable exit | Effort / risk |
|-----|-------------------|------------|-----------------|---------------|
| **L0 — Stable Screen baseline (closed 2026-07-31)** | Preserve the record-id mutation envelope and A→B isolation. Hydration readiness is explicit rather than dependent on a business `id`; late `default_get` cannot overwrite an edited draft; revision guards make the latest applicable `on_change` win; discard and write-mode exit invalidate deferred work, while Save flushes and awaits it before taking the write snapshot. | None | Closed by `06627c7` + `7a7f0fe`: focused Screen tests 19/19; view-engine 57/57; lint, full 13-task suite, web build, 700 KiB bundle budget, and mock browser suite 6/6 pass. No push performed. | Done |
| **L1 — Browser depth evidence** | Add deterministic Playwright coverage for relation queue + parent save, A→B stale-read/write isolation, board action open, wizard/report shell paths, and calendar create/move. The mock gateway is the hard gate; extend live-lab scenarios only where stock Tryton 7/8 exposes the required metadata/model. | L0 | New scenarios pass in `pnpm test:e2e:mock`; applicable live scenarios pass on each series that exposes the feature; an absent stock board/calendar is recorded as a lab limitation, not a failed client gate. | M / Medium |
| **L2 — Decompose `ModelWorkspace`** | Extract record lifecycle/query, list selection/navigation, action toolbar, and search/view-mode concerns behind typed hooks/components without changing RPC shape or behavior. | L0; use L1 as regression net | No component created as another monolith; focused web tests plus unchanged L1 results; build and bundle stay within budget. | M–L / Medium |
| **L3 — Nested Screen lifecycle** | Give O2M/M2M line forms an explicit child Screen contract: validation, on_change propagation, navigation/cancel semantics, and command bubbling into one parent create/write. Freeze that view-engine API before handing off the web wiring; align or retire duplicate relation paths such as `PartyWorkspace`. | L1; L2 strongly preferred | Unit tests cover create/update/remove/cancel and nested validation; the API handoff is recorded before relation components change; one relation-heavy browser flow proves a single parent mutation; Tryton 7/8 RPC evidence remains green; `COMPATIBILITY.md` records the exact supported depth. | L / High |
| **L4 — Dense form layout** | Implement Sao-shaped `colspan`, expansion/alignment, and basic paned layout while preserving existing group/notebook state behavior and exclusive loading/error/empty/data states. | L1; can proceed beside L2/L3 only with separate path ownership | XML parse/render fixtures, responsive and keyboard checks, and representative screenshots or Playwright assertions at desktop/mobile widths. | M / Medium |
| **L5 — Domain filter builder** | Add typed AND/OR clauses, operators, values, validation, and round-trip to Tryton domains; keep raw JSON domain and saved filters interoperable. | L2 | Domain encode/decode unit tests; browser scenario builds, applies, saves, reloads, and deletes a filter; malformed clauses never issue an RPC. | M / Medium |
| **L6 — Board/action polish** | Replace the wizard/report placeholder by reusing the normal shell action host, then verify active ids/context. Do not create an embedded duplicate action runtime; deeper list-form/calendar pane work is a separately justified follow-up. | L1 and L2; schedule after L5 unless a failing workflow raises its priority | One board Playwright scenario proves wizard/report open through the shared host and preserves selection/context; existing tree/form/graph and sibling `_actions` tests remain green. | S–M / Medium |
| **L7 — Release and compatibility gate** | Run accessibility/performance budgets, document a focused threat model and production gateway checklist, and optionally attach a pinned disposable GNU Health lab for metadata/menu/view discovery. GNU Health evidence stays synthetic and read-only until separately governed. | L1–L5 for the core client-depth candidate; L6 gates only a release claiming that board polish; GH track may start earlier in isolation | Minimum gates below pass; strict production ACL/gateway defaults are explicit; `gh:check` and a receipt back only the exact GNU Health claim made; `AUDIT.md` is updated only through a new dated audit. | L / Medium–High |

Recommended sequence:

```text
L0 ─► L1 ─► L2 ─► L3
       │      ├──► L5
       └─────────► L4
L3 + L4 + L5 ─────► L7
             L5 ─► L6 (board-polish claim only)
```

L4 may run while L2/L3 advances only if the active owners do not overlap on
`ModelWorkspace.tsx`, `screen.ts`, or relation editor files.

### Execution checkpoint — 2026-07-31

- **L0 is closed** by `06627c7` plus the jointly reconciled `on_change` follow-up
  `7a7f0fe`; neither agent should rebuild or reopen it without a failing
  regression. Cursor supplied the flushable work model and Codex integrated,
  hardened, and verified the final single implementation.
- **L1 is the next claimable lot.** Its first atomic slice is relation queue +
  one parent Save and A→B stale isolation under the mock gateway. Board,
  wizard/report, and calendar scenarios follow as independent test commits.
- Tool availability is not an ownership signal. Before L1 starts, the first
  active agent records one atomic claim in `AGENT_BRIDGE.md`; the other stays
  read-only on those paths and reviews the resulting handoff. A transient CLI
  status must never trigger a parallel implementation.
- L2 must not start by editing `ModelWorkspace.tsx` until the first L1 slice is
  green. L4 may proceed independently only in parser/render fixtures with an
  explicit non-overlapping path claim.

### Definition of done for every lot

1. trytond remains the only business/clinical truth; no client SQL, parallel
   ORM, or intelligence auto-write path is introduced.
2. The smallest owning package contains the change, with focused unit/contract
   tests and a browser test for user-visible behavior.
3. Any changed RPC path is checked against supported Tryton 7 and 8 labs; a
   Proteus check is supporting oracle evidence, never a runtime dependency.
4. `pnpm lint`, `pnpm test`, `pnpm --filter @epiton/web build`, and
   `pnpm check:bundle` close the batch. Gateway changes additionally run Cargo
   tests/checks; compatibility changes run the relevant live receipt.
5. `COMPATIBILITY.md` changes in the same batch when parity status changes.
   Security or claim changes get a new dated audit, not a silent rewrite of the
   current audit.
6. Loading, error, empty, and data states stay exclusive; keyboard and narrow
   viewport behavior are checked for new UI. No real PHI/PII enters fixtures,
   logs, screenshots, prompts, or telemetry.
7. Each lot closes as a thematic commit. Security/gateway, compatibility lab,
   and UI-depth work are not mixed in one commit.

### Codex/Cursor collaboration contract

| Phase | Implementer | Reviewer | Conflict boundary |
|-------|-------------|----------|-------------------|
| L0 stable Screen baseline | Cursor baseline/work model, then Codex integration and close | Sequential inactive agent | Closed in `06627c7` + `7a7f0fe`; all Screen paths are released and must not be reopened without a regression |
| L1 browser scenarios | First available agent after an explicit claim | The other agent | Implementer exclusively owns the claimed `e2e/**` and mock-fixture paths; reviewer stays read-only and must not write a parallel scenario |
| L2 web extraction | Codex after the first L1 slice | Cursor | Codex claims one extraction seam at a time; Cursor reviews behavior and does not co-edit `ModelWorkspace.tsx` |
| Child-Screen API and web wiring in L3 | Codex, then Cursor | The inactive agent | Codex freezes `screen.ts`, tests, and RPC-facing types; after HANDOFF Cursor owns `Relation*`/`ModelWorkspace` wiring without reopening the API |
| L4 render/layout and L6 board UX | Cursor | Codex | One owner at a time for `parse`/`render` or board components |
| L5 domain algebra then UI | Codex then Cursor | The inactive agent | Freeze the typed search API before the UI handoff; never co-edit `ModelWorkspace.tsx` |
| L7 gateway/lab/evidence | Codex | Cursor | Cursor reviews policy and UI consequences; gateway/docker/CI stay in the claimed lane |

For every handoff, record base SHA, claimed paths, behavior changed, commands
run, results, and unresolved risks. `AGENT_BRIDGE.md` is an operational mailbox,
not a second roadmap. The receiving agent verifies the diff before editing, and
the implementer/reviewer roles swap only at an explicit handoff.

If either agent is unavailable, the active agent may claim the next atomic slice
and the unavailable agent becomes the later reviewer. This is a role swap, not
permission to create a second implementation: one owner, one diff, one handoff.

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
