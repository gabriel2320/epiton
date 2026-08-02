# Tryton client capability inventory

This is the routing inventory for implementation work. It does not duplicate
parity status: the status and notes in [`COMPATIBILITY.md`](COMPATIBILITY.md)
remain canonical, while unresolved depth is ordered in
[`TRYTON_AHEAD.md`](TRYTON_AHEAD.md).

## Capability ownership map

| Capability family | Tryton contract / behavior | Epitón owner | Primary evidence |
|-------------------|----------------------------|--------------|------------------|
| Bootstrap and authentication | database list, login, logout, generic observed `X.Y` server series, preferences | `@epiton/protocol`, web session boundary | protocol tests, 7/8 live lab, scheduled 9.0 upstream canary |
| Menus and navigation | `ir.ui.menu`, favorites, keywords, action stack | protocol action/menu translators, web Shell | protocol tests, mock browser |
| Actions | act_window, wizard, report, URL, email, relate/print keywords | `@epiton/protocol`, shared Shell action host | compatibility tests, board/wizard/report E2E |
| View metadata | `fields_view_get`, form/tree/list-form/calendar/graph/board XML | `@epiton/view-engine` | parser/render fixtures |
| Dynamic behavior | PYSON states, domains, context, defaults, `on_change` | view engine + Screen + workspace hooks | unit tests and workspace E2E |
| Record lifecycle | create/read/write/delete/copy/history, concurrency guards | protocol model calls + Screen/workspace | protocol tests, `_timestamp` parent/nested unit proofs, live CRUD and a Tryton 8 GNU Health two-session stale-write rejection |
| Fields and widgets | scalar, selection, date/time, binary, reference, dict, progress, URL/email | `@epiton/view-engine`, `@epiton/ui` | renderer and interaction tests |
| Relations | M2O search/open, O2M/M2M command queues, nested record lifecycle | Screen, relation editors, protocol | relation unit tests and parent-write E2E |
| Lists | search/order/count, editable/hierarchical tree, pagination, aggregates | view engine + pure workspace search policy + table hosts | unit tests and mock browser |
| Workflows | buttons, validation, wizard state machine, shared context | protocol wizard/action helpers + shared workspace/Shell hosts | unit tests, wizard E2E, button single-flight proof and live GNU Health duplicate-click rejection |
| Documents | native Tryton reports, attachments, MIME handling, PDF preview, CSV import/export | protocol + web document components | unit/mock browser plus live GNU Health `patient.card` PDF |
| Rich views | calendar, graph, board, cross-filter, list-form | view engine + ordered workspace navigation policy + shared Shell host | focused unit tests and E2E |
| Personalization | translations, saved searches, server favorites, domain tabs | protocol + typed controls + in-memory UI projection | protocol/web tests |
| Realtime | authenticated bus channels, notices, action payloads, 401 invalidation | protocol bus + Shell | protocol/web tests |
| Multiplatform | responsive web, keyboard, Tauri, Capacitor, safe areas | web + desktop/mobile shells | Next browser receipt + CI APK/Tauri artifact producers; first green artifacts and real-device proof still required |
| Security boundary | same-origin gateway, CSP, memory-only state, no dynamic cache | Axum gateway + host configs + contract tests | cargo tests, persistence contract, security audit |

## Evidence ladder

A capability moves through the following evidence, in order:

```text
observed behavior
    → neutral contract / fixture
    → translator unit test
    → UI interaction test
    → deterministic browser scenario
    → live Tryton-series receipt
    → compatibility claim
```

Not every UI-only change requires a live lab, but no new RPC shape is complete
without one when the disposable lab is available. “Builds” is not evidence of
Tryton parity, and one green series does not imply another. An upstream canary
receipt proves only artifact availability; it must still climb the protocol,
oracle, browser, and live-series steps before changing a compatibility claim.

## Progressive construction loop

For each automatic batch:

1. Select the highest-priority unresolved row in `TRYTON_AHEAD.md` or a failing
   compatibility receipt.
2. Claim one vertical behavior and identify its owning layer.
3. Add or tighten the neutral contract before wiring presentation.
4. Reuse the shared action, Screen, view, and UI hosts; do not create feature-
   local substitutes.
5. Run focused tests, then the repository close-out gates.
6. Update `COMPATIBILITY.md` only when the evidence changes its wording.

Host migration and client-depth work are separate axes. Moving a component to
Next.js does not improve Tryton parity by itself; translating a Tryton behavior
must not be coupled to a framework rewrite unless the framework boundary is the
actual blocker.

## Current workspace translation receipt

The list workspace now exposes a narrow ownership chain instead of embedding
every concern in one component:

```text
Tryton action metadata / saved-search rows
        -> pure view-host and domain composition policies
        -> typed domain-tab/search controls
        -> existing ModelWorkspace query + shared Shell host
```

`ModelWorkspace` still owns session-bound query state and saved-search RPC;
leaf controls receive callbacks and cannot call trytond. View/domain/tab state
is process-local, resets at the action boundary where required, and is never
written to URLs or durable browser/native storage.

## Current nested Screen translation receipt

L3.2 wires the frozen `@epiton/view-engine` child lifecycle into the shared web
relation host; L3.3 qualifies that same implementation with deterministic M2M
and disposable Tryton 7 evidence:

```text
RelationLineForm + Tryton field metadata
        -> child values + nested queues + latest on_change token
        -> structural validation and cancel/navigation policy
        -> strict server pre_validate when requested
        -> immutable create/write/remove/delete command
        -> parent-owned relation queue
        -> existing parent Screen save boundary
```

The exact API and its server-authority limits are normative in
[`CHILD_SCREEN_CONTRACT.md`](CHILD_SCREEN_CONTRACT.md). Returned x2many
replacement/patch values are translated into queues, and accepting a line
cannot write a child independently. The deterministic O2M receipt proves
queued create+edit as one parent mutation; the M2M receipt proves add `22` /
remove `20` as one parent write with zero child category mutations. A live
Tryton 7 receipt discovers `party.identifier` from metadata and accepts a
transient child after `on_change_with` and `pre_validate`, bringing that live
protocol to 21/21. Full third-party and cross-series relation parity still
requires broader receipts; this evidence must not be generalized beyond the
documented supported depth.
