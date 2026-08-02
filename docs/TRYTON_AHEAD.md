# Where Tryton (Sao/GTK) still surpasses Epitón

Updated: **2026-08-01**. Companion to [`TRYTON_COMPARE.md`](TRYTON_COMPARE.md)
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
| **Notebook** | Exclusive tabs, remembered page, icons/states | **Improved:** exclusive tabs + process-local page selection | Small | `render.tsx` `NotebookHost` |
| **Saved filters** | `ir.ui.view_search` named domains per model/user | **Improved:** load/apply/save/delete via protocol helper | Small | `view_search.ts`, ModelWorkspace |
| **Server favorites / bookmarks** | Persisted user shortcuts on server | **Improved:** exact `ir.ui.menu.favorite.get/set/unset` + star toggle; strict server tuples and no fabricated fallback | Small | `menus.ts`, `Shell.tsx`, `MenuTree.tsx` |
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
| Session CRUD / act_window / menu favorites / keywords | Live `compat:live` 21/21 on Tryton 7 (including relation-child boundary) and prior 20/20 on Tryton 8 |
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
- **Evidence comes first.** The 21/21 Tryton 7 and 20/20 Tryton 8 live receipts prove the wire, not deep
  browser behavior. Relation queues, board actions, wizards, reports, and
  calendars need deterministic browser scenarios.
- **Reduce the workspace hotspot before adding more UI state.**
  `ModelWorkspace.tsx` is now below 2,000 lines but still concentrates list,
  record, action, calendar, search, and relation behavior.
- **Nested Screen and dense form layout are closed client-depth gaps.** Their
  deterministic receipts now protect the next priority: a typed multi-clause
  filter builder interoperable with the existing raw and saved-search paths.
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

L1 is delivered as atomic browser slices. The relation/isolation and board
action-open slices are covered; the next claim is **wizard/report shell paths**.
Calendar follows as a separate slice so each commit expands one mock fixture
surface and has one unambiguous owner/reviewer handoff.

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

---

## Development program (derived from audit + parity work)

This program **schedules** work already justified by
[`AUDIT.md`](AUDIT.md), [`COMPATIBILITY.md`](COMPATIBILITY.md),
[`TRYTON_COMPARE.md`](TRYTON_COMPARE.md), and the closed Screen/L1.1/L1.2
evidence.
It does **not** replace those documents as status authorities. When status
changes, update `COMPATIBILITY.md` (and a new dated `AUDIT.md` section only for
intentional re-audits).

### North star

```text
Ship a modern Apache-2.0 Tryton client whose Session wire and core CRUD/views
match Sao on trytond 7/8 labs, then close Sao UX depth with deterministic
browser evidence — without becoming a HIS, copying GPL Sao/GTK, or owning
business truth outside trytond.
```

### Baseline already earned (do not re-litigate)

| Track | Evidence | Commits / gates (local, 2026-07-31) |
|-------|----------|-------------------------------------|
| Session wire + CRUD | `compat:live` 21/21 on Tryton 7, including transient relation child; prior 20/20 on Tryton 8 | CI + lab receipts |
| Proteus lab oracle | Isolated docker oracle 4/4 | Never product runtime |
| Screen host + parent O2M/M2M queue | Hydrate flag; pristine `default_get`; generation + last-request-wins `on_change`; Save flushes pending work | `06627c7`, `7a7f0fe` (PASS) |
| Browser relation / isolation | One parent `write` for queued create+edit; late A read cannot redirect B | `75a6e44` (PASS); mock e2e 8/8 |
| Browser board action open | Shared Shell `act_window` retains action domain plus `active_id(s)`/`active_model`/`_actions` | L1.2 deterministic mock browser proof (PASS) |
| Production-web boundary | Same-origin gateway, memory-only sessions, CSP | Gateway README + AUDIT checklist |

### Workstreams (parallel only with non-overlapping paths)

| Stream | Goal | Primary packages | Audit / gap anchors |
|--------|------|------------------|---------------------|
| **W0 Host convergence** | Qualify Next App Router without forking the product | `apps/web/app`, host adapters, shell configs | `THREE_LAYER_ARCHITECTURE.md`; Next canary compatibility row |
| **W1 Evidence** | Deterministic Playwright for remaining Sao-depth flows | `e2e/**`, mock Tryton | AUDIT next-batches #1; AHEAD L1 |
| **W2 Workspace structure** | Shrink `ModelWorkspace` hotspot without RPC drift | `apps/web` hooks/components | AHEAD L2 |
| **W3 Nested Screen** | Child Screen contract + single parent mutation | `view-engine`, relation editors | AHEAD L3; executive shortlist #3 |
| **W4 Form density** | Sao-shaped colspan / expand / paned | `view-engine` parse/render | AHEAD L4 |
| **W5 Domain UX** | Typed filter builder ↔ Tryton domains | `view-engine` + workspace search | AHEAD L5 |
| **W6 Board polish** | Wizard/report via shared shell host | Board + Shell action host | AHEAD L6; AUDIT smoke #4 |
| **W7 Release / ops** | Threat model, a11y/perf, GH metadata lab | gateway docs, `GNU_HEALTH.md` | AUDIT A-01/A-09; L7 |
| **W8 Platform shells** | Verify memory-only lifecycle and deletion-only migration on real devices | Tauri / Capacitor bridges | AUDIT A-05 |

### L1 — Browser depth evidence (atomic slices)

Mock gateway is the hard gate. Live lab extends only where stock Tryton 7/8
exposes the feature; missing stock board/calendar is a **lab limitation**, not a
failed client gate.

| Slice | Status | Outcome | Likely paths | Exit |
|-------|--------|---------|--------------|------|
| **L1.1** Relation queue + A→B | **DONE** | O2M create+write queued without Apply → one parent write; late A cannot replace/redirect B | `e2e/workspace.spec.ts`, `e2e/support/mockTryton.ts` | PASS (`75a6e44`) |
| **L1.2** Board action open | **DONE** | Board `<action>` opens through the **existing** shell action host; action domain and active selection/context are preserved | `e2e/board.spec.ts`, mock board fixture, narrow Board/Shell context handoff | PASS (focused + full mock browser gate) |
| **L1.3** Wizard / report shell | **DONE** | Board path runs wizard/report via shared host (no embedded duplicate runtime) and preserves foreign selection/context | `e2e/wizard-report.spec.ts`, mock wizard/report stubs | PASS (`af98ebd`; full mock browser gate) |
| **L1.4** Calendar create / move | **DONE** | Real day click creates through parsed `dtstart`; real pointer drag writes the event; rejected writes surface without a false “Moved” | `e2e/calendar.spec.ts`, synthetic calendar mock | PASS (focused repeat 10/10; full mock 12/12) |

Rules for every L1 slice:

1. One CLAIM, one owner, one atomic commit; execution is Codex-only while that
   user instruction remains active.
2. Expand mock fixtures only as needed for that slice.
3. Do not reopen Screen five-pack without a reproducible regression + new CLAIM.
4. Update `COMPATIBILITY.md` notes when the evidence changes the claim wording.

### L2 — Decompose `ModelWorkspace`

Extract without changing JSON-RPC shapes or Screen invariants:

1. **DONE (L2.1/L2.2):** record lifecycle / hydrate / save / discard helpers
   (consume `view-engine` Screen).
2. **DONE (L2.3):** list selection, multi-select, adjacent nav, domain tabs.
3. **DONE (L2.4, 2026-08-01):** typed list/record action toolbars plus pure
   button-action detection, availability, and canonical active-record context.
   Keywords still use the shared action host; attachments remain owned by the
   shared Shell drawer so the extraction creates no second record-scoped runtime.
4. **DONE (L2.5, 2026-08-01):** pure search/domain composition and ordered
   view/host policy plus typed domain-tab and saved-search controls. The
   workspace still owns `ir.ui.view_search` RPC and volatile state; the shared
   Shell remains the only board/model host router. The first supported Tryton
   action view (`calendar`, `graph`, or `list-form`) is honored and reset when
   action metadata changes; form-only and unknown kinds safely use tree.

Exit: no new monolith; L1.1–L1.x still green; bundle budget intact; each extract
has a focused test or an e2e that pins behavior.

### L3 — Nested Screen lifecycle

Highest product-depth risk. Sequence:

1. **DONE (L3.1, 2026-08-01):** freeze a pure `view-engine` child Screen API
   (validation, last-request-wins `on_change`, cancel/navigation, immutable
   command bubble into the parent queue).
2. **DONE (L3.1, 2026-08-01):** record the normative handoff in
   [`CHILD_SCREEN_CONTRACT.md`](CHILD_SCREEN_CONTRACT.md), `AGENT_BRIDGE`, and
   `COMPATIBILITY` before web wiring.
3. **DONE (L3.2, 2026-08-01):** wire `RelationLinesEditor` / line forms to that
   API; translate x2many `on_change` patches, honor server `pre_validate`, and
   retire the duplicate `PartyWorkspace` lifecycle behind a thin adapter.
4. **DONE (L3.2, 2026-08-01):** one relation-heavy browser flow proves queued
   child create + edit produce exactly one parent `write` and no child mutation.
5. **DONE (L3.3, 2026-08-01):** a deterministic M2M receipt proves add/remove
   membership as one parent write with zero child mutation; the disposable
   Tryton 7 lab discovers a relation child from metadata and accepts its
   transient `on_change_with` + `pre_validate` path (`compat:live` 21/21).

Do not start L3 while **L1.3–L1.4** evidence is still open unless a production
blocker appears; prefer finishing L1 evidence and L2 first to reduce merge
conflict surface.

### L4 — Dense form layout — DONE (2026-08-02)

The neutral XML layout normalizer and shared renderer now support Sao-shaped
`col`/`colspan`/`rowspan`, expansion/fill/alignment, newline, expandable groups,
and basic horizontal/vertical paned layout. Notebook pages remain mounted, with
accessible roving tabs and keyboard navigation, so nested UI state survives
page and viewport changes. A synthetic dense form proves six-column desktop,
single-column mobile, overflow containment, paned position/orientation, and
group/notebook state preservation in Playwright.

May proceed beside L2/L3 **only** with separate path ownership (no shared edit
of `ModelWorkspace.tsx` / `screen.ts` / relation editors).

### L5 — Domain filter builder

Typed AND/OR clauses, operators, values, validation, round-trip to Tryton
domains. Interoperate with raw JSON domain and `ir.ui.view_search`. Malformed
clauses must never issue an RPC. Depends on L2 so search UI is not still
entangled in the monolith.

### L6 — Board / action polish

Replace wizard/report placeholder by reusing the normal shell action host;
verify `active_ids` / context. Deeper list-form/calendar pane work is a
**separately justified** follow-up. Schedule after L5 unless a failing workflow
raises priority (then CLAIM explicitly).

### L7 — Release and compatibility gate

| Gate | Command / artifact | Claim it unlocks |
|------|--------------------|------------------|
| Lint / unit / web build / bundle | `pnpm lint && pnpm test && pnpm --filter @epiton/web build && pnpm check:bundle` | Client depth candidate |
| Mock browser | `pnpm test:e2e:mock` | UI-depth evidence |
| Live protocol | `pnpm compat:live` (7 and 8) | Wire parity |
| Gateway | `cargo test` / `cargo check` in `apps/gateway` | Production-web edge |
| Threat model + a11y/perf budgets | Documented checklist | Pre-production claim |
| GNU Health metadata lab | Pinned synthetic GH + `pnpm gh:check` | Module discovery only — **not** PHI |
| New dated audit | Append section to `AUDIT.md` | Point-in-time posture |

### Out of scope (hard)

- PHI / clinical certification / marketing as Epione HIS (AUDIT A-01).
- REST Bearer compatibility claims (Not probed).
- Sao/GTK GPL source import; GTK-only print plugins.
- Proteus inside `@epiton/protocol` or web runtime.
- Intelligence auto-`create` / `write` / `delete` / `copy` / `import_data`.
- Client SQL / second authoritative store.
- `push --force` to `main`, prod promotion, secret rotation without explicit human order.

### Agent collaboration protocol

| Role | Duty |
|------|------|
| Implementer | CLAIM exact paths in `AGENT_BRIDGE.md` before edit; one atomic diff; gates; `HANDOFF READY` |
| Reviewer | Read-only until handoff; `CURSOR-REVIEW: PASS` or `FINDINGS`; commit if implementer's `.git` is RO |
| Human | Authority for push, PHI, production, license exceptions |

Default next implementation slice: **L5 domain filter builder**. Preserve the
frozen [`CHILD_SCREEN_CONTRACT.md`](CHILD_SCREEN_CONTRACT.md), L3.3 evidence,
and L4 responsive layout receipts. Add typed AND/OR clauses behind the extracted
workspace-search boundary while keeping raw JSON and `ir.ui.view_search`
round-trippable; invalid clauses must stop before any search RPC.

### Milestone map (relative, not calendar)

```text
M0  Wire + Screen + L1.1 + L1.2   ████ DONE
M1  L1.3–L1.4 browser evidence    ████ DONE
M2  L2 workspace decomposition    ████ DONE
M3  L3 nested Screen API+wire     ████ DONE (L3.1 contract + L3.2 wire + L3.3 evidence)
M4  L4 form density ‖ L5 filters  ██░░ (L4 DONE; L5 NEXT)
M5  L6 board polish (optional)    ░░░
M6  L7 release candidate          ░░░
```

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
