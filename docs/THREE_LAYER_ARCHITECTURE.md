# Epitón three-layer architecture

This map turns the product model into package and request ownership. Authority
still lives in [`CANON.md`](CANON.md); parity status lives only in
[`COMPATIBILITY.md`](COMPATIBILITY.md).

## Layer map

```text
Layer 1 — experience
Next.js App Router / React 19 / Tailwind 4 / @epiton/ui
web browser + Tauri shell + Capacitor shell
                         │ typed client calls and parsed view models
                         ▼
Layer 2 — compatibility kernel
@epiton/protocol + @epiton/view-engine + @epiton/intelligence
Axum same-origin gateway for production web
                         │ Tryton JSON-RPC Session, Sao-shaped parameters
                         ▼
Layer 3 — authority
trytond models / ACLs / views / PYSON / actions / wizards / reports
PostgreSQL owned exclusively through Tryton modules
```

The layers are dependency boundaries, not three competing applications. Layer
1 never invents business rows or permissions. Layer 2 translates transport,
metadata, and presentation contracts but owns no business truth. Layer 3 is the
only system of record.

## Ownership

| Concern | Owner | Boundary rule |
|---------|-------|---------------|
| App Router layout and browser lifecycle | `apps/web/app` | Server layout may compose the document; the authenticated Tryton runtime is a client island |
| Workspaces and action host | `apps/web/src` | Consume typed contracts; no direct ad-hoc wire format |
| Shared visual recipes | `packages/ui` | shadcn-style recipes and Radix behavior; no Tryton RPC |
| Session, RPC, actions, wizards, reports, bus | `packages/protocol` | Preserve observed Tryton parameter and response shapes |
| XML views, PYSON, domains, Screen commands | `packages/view-engine` | Deterministic translation; malformed metadata fails explicitly |
| Search and adaptive suggestions | `packages/intelligence` | In-memory, advisory, and unable to mutate trytond |
| Production browser security edge | `apps/gateway` | Same-origin proxy, allowlist, rate limit, correlation, no second API |
| Desktop and mobile packaging | `apps/desktop`, `apps/mobile` | Reuse the web runtime; no native business store |
| Models, ACLs, workflows, reports, persistence | trytond + PostgreSQL | Authoritative and module-compatible |

## Contract flows

| User flow | Translation path | Authoritative result |
|-----------|------------------|----------------------|
| Login | UI → `common.db.login` → Session header | trytond session |
| Open menu/action | `ir.ui.menu` / keyword → action resolver → view request | trytond action and context |
| Render workspace | `fields_view_get` → XML/PYSON parser → React renderer | trytond view metadata |
| Search/list | domain/context/order → `search_read` / `search_count` | trytond rows |
| Edit relation | child Screen commands → parent mutation queue → `create`/`write` | one trytond transaction boundary |
| Run workflow | button or `wizard.*` translator → shared action host | trytond workflow state |
| Report | `report.*.execute` → MIME-safe preview/download | trytond-generated document |
| Notification | authenticated bus → validated action payload | trytond event |

Backend model ids, record ids, domains, drafts, and navigation remain
process-local. They must not be encoded into URL state or durable client stores.

## Nested Screen boundary receipt (2026-08-01)

The pure child lifecycle is frozen in
[`CHILD_SCREEN_CONTRACT.md`](CHILD_SCREEN_CONTRACT.md). Layer 1 owns relation
metadata requests, server calls, debounce, confirmation, and rendering. Layer 2
owns immutable child snapshots, async identity guards, structural validation,
and translation into the parent relation queue. Layer 3 owns domains, ACLs,
`pre_validate`, business constraints, and the final transaction.

No child editor may issue an independent create/write as part of accepting a
line. The only accepted path is child command → parent queue → one parent
mutation. L3.1 freezes this API; L3.2 connects the web relation hosts and L3.3
proves both one2many and many2many parent-owned mutation flows in the browser
and against the disposable Tryton 7 stack.

## Workspace decomposition receipt (2026-08-01)

The L2 workspace extraction keeps the three layers explicit:

- Layer 1 renders typed list/record toolbars, domain tabs, and search controls.
  Leaf components receive state and callbacks; they do not own RPC or business
  rules.
- Layer 2 supplies deterministic policies for action/tab/search domain
  composition, initial ordered view selection, board/model host selection, and
  the existing view-engine domain/PYSON translation.
- Layer 3 continues to own action metadata, rows, counts, saved searches, ACLs,
  and every mutation through trytond.

`ModelWorkspace` remains the session-bound coordinator for list queries and
`ir.ui.view_search`; `Shell` remains the single action/board host. Action view
metadata resets the volatile projection, while form-only or unknown future
view kinds fail safely to tree. Vite and Next still mount the same
`EpitonClient`, so no host-specific Tryton behavior was introduced.

## Next.js host convergence

Epitón has one frontend with two deployment adapters: a request-time Next host
for production web and an embedded-static adapter for native WebViews. During
the migration, Vite also remains the existing web release entrypoint:

1. **N0 — canary:** Next.js App Router mounts the existing React application as
   a client island. Vite remains the current web release host and the static
   asset adapter for Tauri and Capacitor.
2. **N1 — qualification:** the Next host must pass the same unit and browser
   scenarios, implement a nonce/hash-compatible production CSP, preserve
   static-only PWA caching, while CI must produce verified artifacts from both
   native shells using the same `EpitonClient`.
3. **N2 — web cutover:** make Next the default production-web build and adapt
   its bundle budget. Remove the Vite web entrypoint, but retain the smallest
   static packaging adapter required by native WebViews until a server-backed
   native deployment is deliberately adopted.

The canary is not a second UI or a fork: it imports the same `App`, packages,
styles, stores, and translators. Product behavior may not diverge between
hosts. A host-specific adapter may inject environment and document concerns,
but it must not contain Tryton behavior.

### Current convergence receipt (2026-08-02)

- N0 is implemented in `apps/web/app`: App Router owns the document and mounts
  the shared `EpitonClient` through one client-provider island.
- `pnpm check:next` is the canary build gate; `pnpm dev:next` and
  `pnpm --filter @epiton/web start:next` are its development and production
  entrypoints.
- The Vite release build continues to consume that same `EpitonClient` through
  `src/mount.tsx`; no product screen or Tryton translator is host-specific.
  Request-time nonce/Proxy behavior stays in the Next web adapter and is not
  weakened to make it exportable as static files.
- The N1 web-security slice is qualified: `proxy.ts` creates a fresh nonce per
  request, the dynamic App Router document consumes it, production
  `script-src` uses the nonce with `strict-dynamic`, and RPC remains pinned to
  the same-origin gateway.
- `pnpm test:e2e:next` builds and starts the production Next host, then proves
  15 deterministic browser scenarios across login, workspace CRUD/relations,
  board, wizard/report, calendar, response headers, nonce rotation, and the
  absence of CSP console violations. The same receipt installs the Next
  manifest and service worker, exercises an authenticated RPC flow, and proves
  that Cache Storage contains only allowlisted same-origin static build assets.
- The repository now tracks the Capacitor Android project and CI definitions
  that build/upload a debug-signed Android APK plus unsigned Linux Tauri
  DEB/AppImage bundles. Both jobs emit SHA-256/source/toolchain receipts and
  attest subjects on push. A manual protected workflow now produces the signed
  Android and exact Linux release candidates from clean `main`, with receipts
  and attestations that remain non-promotable. N1 remains open until these jobs
  produce their first green Actions receipts. The fail-closed native promotion
  contract makes independent signature verification and physical-device
  acceptance executable requirements with separated authorities; those real
  approvals remain external evidence. Until that evidence exists, Vite remains
  the web release bridge and N2 may not begin.

## Clean-room Tryton translation

Tryton, Sao, and GTK are behavioral references, not copy sources for this
Apache-2.0 tree. Every compatibility slice follows this sequence:

1. Observe public documentation, wire traffic, and black-box behavior using
   synthetic data.
2. Record the neutral contract in a fixture, type, or capability probe.
3. Reimplement the behavior in Epitón without pasting GPL implementation code.
4. Prove it with focused unit tests, deterministic browser evidence, and a live
   lab check when the wire shape changed.
5. Update the canonical compatibility row; never promote parity from visual
   resemblance alone.

## Version policy

- Tryton 7.0 is a supported LTS lab tier.
- Tryton 8.x is the current published series and a supported lab tier.
- Tryton 9 is a future canary target. Until an official series and artifacts
  exist, Epitón may prepare capability-based fallbacks but must not claim or
  fabricate compatibility.

`@epiton/protocol` preserves the series observed from
`common.server.version` as generic `X.Y`; it does not encode a closed list of
supported releases. Certification is separate and lives in
[`config/tryton-series-policy.json`](../config/tryton-series-policy.json).
Prefer server capability probes and tolerant contract translators over a
hard-coded `version === 9` branch. A new series becomes supported only after
every official-artifact, protocol, reference-oracle, and browser receipt named
by that policy exists.
