# Epitón audit — 2026-07-31

Scoped review of the Epitón monorepo as a **Tryton-compatible client**
(not a HIS, not a second database, not a Sao/GTK fork).

## Verdict

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture fit | Strong | JSON-RPC Session → trytond; gateway mandatory for production web |
| Sao parity (P0/P1) | Good | CRUD, views, wizards, reports, boards, analytics hosts |
| Security posture | Hardened baseline | Memory-only sessions; same-origin CSP; defensive gateway |
| PHI readiness | **Not claimed** | Synthetic lab only; GNU Health discovery is metadata-only |
| License hygiene | Strong | Apache-2.0 client; no Sao/GTK copy |
| Agent operability | Was weak → now documented | See `AGENTS.md`, `docs/CANON.md`, `docs/GOVERNANCE.md` |
| Docs completeness | Was fragmented → hubbed | README is the index |

**Overall:** ready as a modern Tryton **client platform** against synthetic labs
and controlled trytond deployments. Protocol and browser CRUD boundaries are
verified on Tryton 7 and 8. This is **not** a clinical system of record, a
security certification, or a substitute for HIS governance.

## What Epitón is / is not

| Is | Is not |
|----|--------|
| Multiplatform UI over Tryton RPC | Owner of clinical/business truth |
| Sao-compatible interaction shape | GPL Sao/GTK source derivative |
| Required production-web gateway | Replacement for trytond ACLs |
| Local intelligence (search/layout) | Auto-writer of clinical data |
| GNU Health *compatible path* | Bundled GNU Health product |

## Architecture snapshot

```text
Production browser ─► same-origin edge ─► apps/gateway (Axum)
Native / dev client ────────────────────► gateway or controlled trytond
                                           │ JSON-RPC Session
                                           ▼
                                        trytond ─► PostgreSQL
```

Packages: `protocol`, `view-engine`, `ui`, `intelligence`.
Apps: `web`, `desktop` (Tauri), `mobile` (Capacitor), `gateway` (Rust).

## Strengths observed

1. Clear SoT boundary: mutations go through Tryton models/wizards/reports.
2. Tryton 7/8 protocol, Proteus-oracle, and browser CRUD evidence in CI.
3. Gateway features: correlation id, rate limit, body limit, CORS allowlist,
   optional strict ACL on mutating RPC.
4. Explicit rejection of parallel Python ORM/report stacks (`docs/TOOLING.md`).
5. Board analytics + graph arch stay on `search_read` / `fields_view_get`
   (visual only; no client warehouse).
6. Session tokens are memory-only in web, Tauri, and Capacitor builds; legacy
   persistent slots are cleared and never hydrated.

## Gaps and risks

| ID | Severity | Finding | Mitigation |
|----|----------|---------|------------|
| A-01 | High (product claim) | No production PHI/HIS certification | Do not market as Epione; keep GH Phase 4 |
| A-02 | Low | Board panes were analytics-only | **Closed enough:** embedded tree/graph/form + multi-y |
| A-03 | Low | Graph multi-y / `_actions` incomplete | **Closed enough:** `_actions` + heuristics + multi-y |
| A-04 | Informational | REST Bearer is outside the supported contract | Do not claim it; use Session RPC through the gateway |
| A-05 | Low | Desktop/mobile thinner than web and intentionally non-persistent | Add an audited native secret-store provider before offering session persistence |
| A-06 | Low | pdfjs unused vs iframe | **Closed:** `PdfPreview` page/zoom with iframe fallback |
| A-07 | Low | Docs were README-thin for agents | This audit + CANON/GOVERNANCE/AGENTS |
| A-08 | Process | Lab credentials are synthetic defaults | Never reuse in shared/prod envs |
| A-09 | Medium (claim) | No dedicated GNU Health lab evidence yet | Keep compatibility metadata-only until a pinned, synthetic GH lab is verified |

## Security checklist (point-in-time)

- [x] No Sao/GTK GPL source imported
- [x] Session token not in `localStorage`
- [x] `javascript:` blocked on URL actions / binary links (client guards)
- [x] Production web cannot select a direct/cross-origin trytond endpoint
- [x] Gateway is POST-only, validates RPC/database input, limits body/rate/time,
      rejects upstream redirects, and emits no response bodies in audit logs
- [x] Strict ACL mode can only add a fail-closed denial; trytond remains authority
- [x] CI: lint, typecheck, unit tests, build/budget, Rust gates, mock browser flow,
      and Tryton 7/8 protocol/oracle/live-browser matrix
- [ ] Formal threat model / pen-test (out of scope of this audit)
- [ ] Prod IdP / TLS termination / secret rotation playbooks (ops, not client)

## Recommended next batches (human priority)

1. Extend Playwright coverage to boards, wizard/report actions, calendars, and relation-heavy forms.
2. Formalize `@epiton/ui` Dialog recipes and retire duplicated wrappers gradually.
3. Add a pinned, disposable GNU Health lab before making module-level claims.
4. Wire an audited OS secret-store provider if persistent native sessions become a requirement.
5. Complete threat modeling, accessibility, and performance budgets before a production-readiness claim.

## Lab smoke checklist (manual / Playwright backlog)

When trytond lab is up:

1. Login → database datalist populates if `common.db.list` works.
2. Hierarchical model: expand nodes under two different act_window domains; confirms separate `ir.ui.view_tree_state` rows.
3. Open Reports drawer with no selection → notice; ids field empty (not `1`).
4. Board pane with wizard/report action → **Open wizard/report** runs shell path.
5. Calendar view: click date creates (soft-fail OK); drag moves when model allows write.
6. Form button `type="action"` opens resolveAction path; method buttons still call `model.method`.
7. Attachments: Add link + Open; upload data still works.
8. REST / PHI: no claims — Session only; A-01 still open.

Automated today: login, list/form read, create, save, copy, CSV import/export,
delete, and logout across a deterministic mock gateway; login/create/save/delete
also run browser → gateway → live trytond on both supported series.

## Evidence anchors

- Compatibility: `docs/COMPATIBILITY.md`
- Tooling rejects: `docs/TOOLING.md`
- Intelligence safety: `docs/INTELLIGENCE.md`
- GH matrix: `docs/GNU_HEALTH.md`
- Gateway: `apps/gateway/README.md`
- Lab: `docker/README.md`
- CI: `.github/workflows/ci.yml`

---

# Epitón audit delta — 2026-07-31 (evening)

Re-audit after Screen L0, L1.1 relation/isolation, L1.2 board Open, bridge
Ops dashboard, and the development program in `TRYTON_AHEAD.md`. Complements
(does not replace) the morning audit above.

## Verdict update

| Dimension | Score | Delta vs morning |
|-----------|-------|------------------|
| Architecture fit | Strong | Unchanged |
| Sao parity (P0/P1) | Good → **Good+** | Screen queue + board Open evidence |
| Browser depth evidence | **Improving** | Mock e2e includes workspace + board (`4da1eec`) |
| Security posture | Hardened baseline | Unchanged; threat model still open |
| PHI readiness | **Not claimed** | Unchanged (A-01) |
| Agent operability | **Strong** | Ops dashboard + CLAIM/HANDOFF protocol |

**Overall:** client platform posture holds. Protocol wire remains verified.
Largest *product* depth gap is still **nested Screen lifecycle**; largest
*evidence* gap in the active program is **L1.3 wizard/report shell** then
**L1.4 calendar**. Do not claim PHI/HIS or REST Bearer.

## Closed since morning audit

| ID | Closure |
|----|---------|
| Screen hydrate / races / `on_change` flush | `06627c7`, `7a7f0fe` |
| Parent O2M queue → one write; A→B isolation | `75a6e44` (L1.1) |
| Board Open → Shell with foreign selection context | `4da1eec` (L1.2) |
| Agent bridge mailbox | Ops dashboard + templates in `AGENT_BRIDGE.md` |
| Development program schedule | `TRYTON_AHEAD.md` § Development program (`cc666c7`) |

## Open gaps (prioritized)

| ID | Severity | Gap | Program / mitigation |
|----|----------|-----|----------------------|
| G-01 | High (depth) | Nested child Screen: validation, nav/cancel, `on_change` bubble into one parent write | L3 after L1 evidence + prefer L2 first |
| G-02 | Medium (evidence) | No deterministic Playwright for board/keyword **wizard/report** Open via shared host | **L1.3 NEXT** (AUDIT smoke #4) |
| G-03 | Medium (evidence) | Calendar create/drag browser proof incomplete | L1.4 |
| G-04 | Medium (maintainability) | `ModelWorkspace.tsx` ~2k-line hotspot | L2 decompose |
| G-05 | Medium (UX depth) | Dense form `colspan` / paned / expansion | L4 |
| G-06 | Medium (UX depth) | Multi-clause domain filter builder | L5 (after L2) |
| G-07 | Medium (claim) | No pinned GNU Health synthetic lab (`gh:check` exit 2 on stock) | A-09; L7 / GH track |
| G-08 | High (claim) | No PHI/HIS certification | A-01 — never market as Epione |
| G-09 | Low | Native session persistence needs audited secret-store | A-05; W8 only if required |
| G-10 | Low (ops) | Formal threat model / a11y / perf budgets | L7 |
| G-11 | Informational | REST Bearer Not probed | A-04 — Session + gateway only |
| G-12 | Process | Local `main` ~29 commits ahead of `origin`; no push | Human decides promotion |
| G-13 | Process | Overlapping `codex exec resume` caused thrash | Bridge rule: one resume at a time |

## Evidence snapshot (local)

```text
HEAD tip: 635c39e (bridge dashboard refresh)
L1.1: 75a6e44 PASS
L1.2: 4da1eec PASS (board Playwright 1/1; mock suite includes board.spec)
Wire: compat:live 19/19 Tryton 7/8 (CI / prior receipts)
Push: not done
Active CLAIM: none — next L1.3 requires new CLAIM
```

## Recommended order for Codex / Cursor

1. **CLAIM L1.3** — wizard/report Open through shared Shell host + mock e2e.
2. **CLAIM L1.4** — calendar create/move mock evidence.
3. **CLAIM L2** — ModelWorkspace extract (regression net = L1.*).
4. **CLAIM L3** — nested Screen API freeze then wire (highest depth risk).
5. L4 / L5 path-isolated; L6 board polish if needed; L7 release gates.
6. Keep A-01 / A-09 / REST out of product claims until separately governed.

## Explicit non-goals (unchanged)

Sao/GTK GPL import · Proteus in product runtime · Intelligence auto-writes ·
Client SQL · PHI fixtures · force-push / prod promotion without human order.

---

# Epitón audit delta — 2026-07-31 (Codex-only security correction)

Targeted re-audit after the user disabled the Cursor bridge. This section is an
append-only delta; earlier findings remain historical evidence rather than the
current execution state.

## Verdict

The corrected worktree preserves Tryton wire truth and in-memory-only sessions.
Three concrete security/availability gaps are closed locally. No PHI/HIS,
penetration-test, or native-release claim is added.

| ID | Severity | Finding | Closure |
|----|----------|---------|---------|
| S-01 | High | Native legacy cleanup used runtime code generation, conflicting with a strict CSP and hiding cleanup failures | Static local Tauri/Capacitor adapters, no session save/load persistence, five focused tests, production build proof |
| S-02 | Medium | Gateway buffered upstream response bodies without an application cap | Configurable 64 MiB default; Content-Length precheck plus streamed chunk enforcement; deterministic 502 and unit coverage |
| S-03 | Medium | CI lacked explicit production JavaScript and Rust advisory gates | `pnpm audit --prod --audit-level high` plus RustSec `audit-check`; local JavaScript audit is clean |
| S-04 | Process | Operational dashboard still required a Cursor reviewer/CLAIM despite the user's solo-Codex directive | Dashboard switched to Codex-only mode; prior Cursor exchanges retained as inactive history |

## Verification snapshot (RAM-safe and sequential)

```text
Base: 7304513
Typecheck: PASS — 13/13 tasks
Unit tests: PASS — 13/13 tasks; web 27 tests; gateway 9 tests
Lint: PASS — 182 files
Web production build: PASS
Bundle budget: PASS — largest initial chunk 468.1 KiB / 700 KiB
Production JS advisory audit: PASS — no known vulnerabilities
Gateway cargo fmt --check / test --locked / check --locked: PASS
Push: not done
```

## Residual risk and next action

- Tauri and Capacitor cleanup modules compile and their adapter contracts are
  tested, but real-device plugin execution remains a native release gate.
- Size `EPITON_MAX_RESPONSE_BYTES` against the largest legitimate deployment
  report; exceeding it intentionally returns 502 instead of exhausting memory.
- Formal threat modeling, penetration testing, GNU Health lab evidence, and PHI
  readiness remain open. Epitón must not be marketed as certified on this basis.
- L2.4 action-toolbar extraction remains the next product slice, now executed and
  verified by Codex without Cursor handoffs.

---

# Epitón audit delta — 2026-07-31 (backend-authority boundary)

Codex-only review of canon, client architecture, protocol contracts, gateway
limits, and live compatibility. This delta supersedes earlier client-persistence
recommendations: current Epitón does not offer persistent sessions, including
through a native secret store. Any future exception requires an explicit canon
and threat-model change.

## Verdict

trytond remains the only business and clinical authority. Authentication,
connection data, RPC results, backend identifiers, domains, drafts, navigation,
layout, preferences, and analytic projections now remain in process memory and
are discarded at the authentication/lifecycle boundary. Static PWA build assets
and explicit user exports are not backend-state copies.

| ID | Severity | Finding | Closure |
|----|----------|---------|---------|
| B-01 | High | Connection, board order, domain tabs, notebook tabs, and deep links could survive or escape the process boundary | Removed durable storage and backend identifiers from URL/history; added deletion-only legacy cleanup and a repository contract test |
| B-02 | High | Logout or an authenticated 401 could leave query, protocol, bus, or UI projections visible | Centralized purge clears the protocol session, TanStack Query cache, Zustand user state, and bus loop; page lifecycle teardown also purges |
| B-03 | Medium | RPC accepted weakly correlated/malformed envelopes and coerced login/search shapes | Per-client request sequence, exact response id, exclusive `result`/`error`, strict login tuple and object-row validation |
| B-04 | Medium | Browser transport and PWA caching policy were partly implicit | RPC/bus set `no-store`, omit ambient credentials and referrers; Workbox runtime caching is empty |
| B-05 | Medium | Tauri registered the generic Store default permission, leaving read/write persistence commands available beyond the deletion need | Removed plugin, JavaScript/Rust dependencies, and Store capability; an exact native unlink command is the only desktop migration surface |
| B-06 | Medium | Gateway buffered upstream reports without an application response cap | 64 MiB configurable default with Content-Length precheck and per-chunk enforcement |
| B-07 | High | Shell navigation queried a fictional favorite field, could write `ir.ui.menu`, and supplied locally invented fallback actions | Added the exact `ir.ui.menu.favorite.get/set/unset` contract, strict menu/favorite decoding, backend error states, and tests that forbid menu-record writes and client fallbacks |
| B-08 | Medium | The mock browser suite assumed a client-invented initial Party workspace and did not expose Tryton's favorite service | The mock now implements the exact favorite RPCs; shared login opens the backend-supplied menu, and all 12 browser scenarios pass without a fabricated startup view |

## Verification snapshot (sequential / RAM-safe)

```text
Base: 7304513
Typecheck: PASS — 13/13 tasks
Lint: PASS — 190 files
Unit/contract tests: PASS — 170 tests (protocol 55, view-engine 57,
  web 30, compat 19, intelligence 4, ui 5)
Mock browser E2E: PASS — 12/12
Web production bundle: PASS — largest initial chunk 468.1 KiB / 700 KiB
Production JavaScript advisory audit: PASS — no known vulnerabilities
Gateway cargo fmt --check / test --locked / check --locked: PASS — 9 tests
Desktop cargo fmt --check / check --locked: PASS
Live protocol compatibility: PASS — Tryton 7 20/20; Tryton 8 20/20
git diff --check: PASS
Push: not done
```

## Position relative to Tryton

- Epitón continues to use Tryton's Session JSON-RPC, models, ACLs, rules,
  wizards, reports, and PostgreSQL-owned truth; live 7/8 compatibility proves the
  wire contract for the covered fixture.
- Epitón adds an executable client-minimization boundary, strict response
  correlation, explicit transport privacy flags, and deterministic purge tests.
- These are Epitón hardening properties, not an assertion that Sao/GTK is
  insecure and not a claim of complete Sao feature parity.

## Residual risk

- Tauri and Capacitor deletion adapters still require real-device integration
  evidence; desktop removal is exact-file-only and mobile uses only
  `Preferences.remove`, never `get` or `set`.
- Desktop/mobile package test scripts remain placeholders. The static contract
  scans their TypeScript and desktop Rust sources, while real lifecycle behavior
  remains a native release gate.
- RustSec is enforced in CI; local evidence covered the production JavaScript
  audit, gateway Rust format/test/check, and desktop Rust format/check gates.
- Formal threat modeling, penetration testing, production IdP/TLS/rotation,
  accessibility/performance budgets, GNU Health evidence, and PHI readiness
  remain open. Do not market Epitón as certified or as Epione HIS.

---

# Epitón audit delta — 2026-08-02 (dense form layout)

L4 closes the previously recorded dense-form depth gap without changing the
Tryton RPC contract or introducing client-side business authority. The
implementation is a clean-room, neutral interpretation of server-supplied XML
attributes and remains inside the shared view renderer.

## Closed finding

| ID | Previous severity | Finding | Closure |
|----|-------------------|---------|---------|
| G-05 | Medium (UX depth) | Dense form `colspan` / paned / expansion | Layout normalization and rendering now cover columns/spans, expand/fill/alignment, newline, expandable groups, and basic positioned panes. Mounted notebook panels preserve nested state; accessible keyboard tabs and responsive desktop/mobile containment are proved in Chromium. |

## Verification snapshot

```text
Base: c200183 + L4 worktree
Typecheck: PASS — 13/13 tasks
Lint: PASS — 223 files
Unit/contract tests: PASS — 201 tests (protocol 59, view-engine 70,
  web 44, compat 19, intelligence 4, ui 5)
Dense form Playwright: PASS — 1/1 desktop/mobile scenario
Mock browser E2E: PASS — 14/14
Web production build: PASS — 1,671 modules; PWA 25 entries
Bundle budget: PASS — largest JavaScript asset 468.1 KiB / 700 KiB
git diff --check: PASS
Push: not done
```

## Residual risk and next action

- The layout is intentionally a supported subset, not a claim of pixel parity
  with every Sao/GTK extension; unsupported server widgets remain governed by
  the existing compatibility matrix.
- L5 typed AND/OR filtering is the next client-depth slice. Raw JSON domains and
  server-owned saved searches must remain interoperable, and malformed clauses
  must never issue an RPC.
- L7 still owns the formal threat model, accessibility/performance budgets,
  native artifact receipts, and any separately governed GNU Health evidence.

---

# Epitón audit delta — 2026-08-02 (typed domain filtering)

L5 closes the multi-clause filter gap at the extracted workspace-search
boundary. Domain state remains a volatile client projection and every applied
or saved domain continues through trytond-owned search and `ir.ui.view_search`
contracts; this change adds no client business store or mutation authority.

## Closed finding

| ID | Previous severity | Finding | Closure |
|----|-------------------|---------|---------|
| G-06 | Medium (UX depth) | Multi-clause domain filter builder | Typed flat AND/OR clauses now cover the documented Tryton operators, field-aware values, optional hierarchy/reference targets, and strict domain validation. Builder-shaped saved filters round-trip; nested domains remain strict raw JSON. Invalid clauses disable list/count/export work before any RPC. |

L6 is also confirmed complete by previously earned L1.3 evidence: board
wizard/report actions reuse the shared Shell host and preserve active
selection/context. No duplicate embedded action runtime was introduced.

## Verification snapshot

```text
Base: b1ad35b + L5 worktree
Typecheck: PASS — 13/13 tasks
Lint: PASS — 225 files
Unit/contract tests: PASS — 207 tests (protocol 59, view-engine 75,
  web 45, compat 19, intelligence 4, ui 5)
Filter builder Playwright: PASS — 1/1 build/apply/save/reload/delete scenario
Mock browser E2E: PASS — 15/15
Web production build: PASS — 1,672 modules; PWA 25 entries
Bundle budget: PASS — largest JavaScript asset 468.1 KiB / 700 KiB
git diff --check: PASS
Push: not done
```

## Residual risk and next action

- The visual builder intentionally represents flat AND/OR domains. Nested
  combinations and `where` operands remain available through validated raw JSON
  rather than implying a tree editor that the client does not yet provide.
- L7 is now the active slice: formal threat model, executable
  accessibility/performance budgets, production gateway checklist, supported
  live compatibility receipts, and native artifact evidence where the local/CI
  environment can truthfully produce it.
- GNU Health remains an optional, separately pinned metadata-only lab claim;
  PHI readiness, clinical certification, and penetration testing are not
  inferred from this client-depth closure.

---

# Epitón audit delta — 2026-08-02 (client release candidate)

The planned core-client slices L1–L7 are complete. This is a reproducible
client release-candidate verdict, not a production authorization, security or
WCAG certification, native signing/device receipt, PHI-readiness finding, or
clinical-product claim.

## Closed finding

| ID | Previous severity | Finding | Closure |
|----|-------------------|---------|---------|
| G-10 | Low (ops) | Formal threat model / accessibility / performance budgets | `THREAT_MODEL.md` now records the focused browser/gateway/native boundaries and explicit exclusions. `pnpm test:e2e:release` enforces versioned accessibility and performance limits, and the gateway README plus `config/gateway-production.env.example` provide a reviewed deployment starting point. |

## Verification snapshot

```text
Base: d101972 + L7 worktree
Typecheck: PASS — 13/13 tasks
Lint: PASS — 227 files
Unit/contract tests: PASS — 207 tests (protocol 59, view-engine 75,
  web 45, compat 19, intelligence 4, ui 5)
Mock browser E2E: PASS — 16/16
Release browser E2E: PASS — 1/1
Next production E2E/CSP/PWA: PASS — 15/15
Tryton 7 live protocol/browser: PASS — 21/21 + 1/1 CRUD
Tryton 8 live protocol/browser: PASS — 21/21 + 1/1 CRUD
Web production build: PASS — 1,672 modules; PWA 25 entries
Bundle budget: PASS — largest JavaScript asset 468.1 KiB / 700 KiB
Gateway release build: PASS — cargo build --release --locked in Docker
git diff --check: PASS
Push: not done
```

The standalone Chromium receipt recorded 505 DOM nodes, zero duplicate ids,
zero unnamed interactive accessibility nodes, CLS 0, one 62 ms long task,
41.5 ms DOMContentLoaded, 80.6 ms login-to-shell, and 888.3 ms
menu-to-workspace. These local regression numbers are compared to the
versioned budgets; they are not production SLOs or a representative field
performance study.

The live relation-boundary probe now creates and removes a synthetic temporary
party when a fresh lab has no suitable row, so both supported series exercise
the same 21-probe contract without depending on mutable lab history. The live
browser fixture likewise follows the server-supplied Parties menu before CRUD.

## Promotion boundary and residual risk

- The Actions workflow now has one pnpm version authority (`packageManager`),
  closing the bootstrap conflict that stopped recent remote runs before the
  JavaScript gates. The native APK and Tauri DEB/AppImage jobs are defined, but
  there is no first-green artifact receipt for this unpublished commit; no
  native artifact claim is made.
- The current host has no `cargo` executable. The gateway release image did
  complete `cargo build --release --locked`, and CI defines locked RustSec,
  format, test, and check gates. A remote green run remains promotion evidence,
  not unfinished client behavior.
- Real-device lifecycle checks, release signing/notarization, deployment TLS,
  identity/rotation operations, penetration testing, a formal WCAG audit,
  production load data, and incident exercises remain production/native
  acceptance work.
- GNU Health remains an optional metadata-only discovery track. No PHI,
  clinical workflow, certification, or HIS claim follows from this release
  candidate.

---

# Epitón audit delta — 2026-08-02 (nested Screen exit integrity)

The remaining G-01 host-integrity gap is closed for the shared relation editor.
This delta extends the frozen child Screen contract; it does not replace
trytond validation, widen the supported module set, or authorize production
PHI.

## Closed finding

| ID | Previous severity | Finding | Closure |
|----|-------------------|---------|---------|
| G-01 | High (data integrity) | A dirty relation-line form could be replaced by row navigation or a new line, and the parent Screen could save before the draft entered its relation queue. | Dirty-exit decisions now bubble through nested relation editors. Every replacing action confirms before discard, a rejected switch preserves the target and values, and parent Save/Ctrl+S stays blocked until the line is accepted or cancelled. The deterministic O2M receipt still emits exactly one parent `write` and no direct child mutation. |

## Verification snapshot

```text
Base: e3090cb + nested Screen exit-integrity worktree
Typecheck: PASS — 13/13 tasks
Lint: PASS — 231 files
Unit/contract tests: PASS — 242 tests (protocol 66, view-engine 89,
  web 59, compat 19, intelligence 4, ui 5)
Mock browser E2E: PASS — 16/16
Next production E2E/CSP/PWA: PASS — 15/15
Web production build: PASS — 1,675 modules; PWA 25 entries
Bundle budget: PASS — largest JavaScript asset 468.1 KiB / 700 KiB
GNU Health `health` PostgreSQL acceptance: PASS — client clinical/role
  journeys 2/2; Tryton 8.0.7; PostgreSQL 18.4; Python 3.14.6
Operational recovery: PASS — live custom-format backup restored with one
  protected clinical record
Fixture cleanup: PASS — zero synthetic clinical, role, product, or party rows
git diff --check: PASS
Push: not done
```

The clinical receipt remains synthetic and disposable. It proves the accepted
Spanish `health` workflow, eight effective role journeys, backend-owned patient
card PDF, protected-state immutability, backup/restore, and controlled cleanup;
it is not a clinical certification, penetration test, production deployment,
or PHI-handling authorization.

---

# Epitón audit delta — 2026-08-02 (GNU Health server-truth and audit closure)

The client boundary for the central GNU Health `health` slice now preserves
Tryton as the sole clinical truth after writes, rejects stale concurrent saves,
and carries one request correlation UUID through Epitón's gateway header and
Tryton context. This closes the technical client/audit acceptance gate for this
module; it does not advance the module roadmap or authorize production PHI.

## Verification snapshot

```text
Epitón implementation base: 0d5e3eb390b479918cca218a90f6c6a27e6c2da2
GNU Health implementation base: 185372d5f2ecd5cac642b4af8b1172eaf2f64ab1
Workspace test graph: PASS — 13/13 tasks
Unit/contract tests: PASS — 268 tests (protocol 73, view-engine 94,
  web 73, compat 19, intelligence 4, ui 5)
Lint: PASS — 238 files
Web production build: PASS — 1,678 modules
Bundle budget: PASS — largest JavaScript asset 468.1 KiB / 700 KiB
Gateway tests: PASS — cargo test --locked 9/9
Gateway release build: PASS — locked Docker release build
GNU Health structural suite: PASS — 37/37
GNU Health PostgreSQL acceptance: PASS — Tryton 8.0.7;
  PostgreSQL 18.4; Python 3.14.6; Spanish translations 3,003
GNU Health browser acceptance: PASS — Playwright 3/3
Discovery: PASS — 70 gnuhealth.* models, metadata only
Authoritative audit: PASS — 68 correlated Epitón→Tryton events
Audit chain receipt: 2676fb4216c64e9b282ac116cd22650861689bbfe84347a276126de1fb8e63f9
Operational recovery: PASS — receipt preserved through backup, restore
  and controlled cleanup
Fixture cleanup: PASS — zero synthetic clinical, role, product,
  professional or user residue in the operational databases
Push: not done
```

Epitón now reloads authoritative server records after clinical writes and uses
latest-request-wins navigation, so a delayed workspace request cannot overwrite
a newer user selection. The client retains no durable clinical state. The
gateway audit line contains correlation, RPC, status and latency but no payload;
the backend event contains stable references, field names and hashes but no
clinical values, request body or response body.

The remaining gates are migration of a representative GNU Health 5.0/Tryton 7
database, PHI operating controls, clinical and Chilean regulatory approval,
production deployment/incident exercises and the later modules. No claim from
this delta extends beyond the central `health` slice.

---

# Epitón full audit — 2026-08-03 (three-layer architecture)

Point-in-time review of the **local** Epitón monorepo at
`/home/gabriel/epiton`, framed by
[`THREE_LAYER_ARCHITECTURE.md`](THREE_LAYER_ARCHITECTURE.md). Complements prior
deltas; does not erase them. Interactive canvas (three layers):
[`epiton-three-layer-audit.canvas.tsx`](/home/gabriel/.cursor/projects/home-gabriel-epiton/canvases/epiton-three-layer-audit.canvas.tsx).

**Scope:** architecture ownership, client depth, security/minimization,
compatibility evidence, release/promotion posture. **Out of scope as claims:**
PHI readiness, clinical certification, penetration test, WCAG certification,
production promotion, Epione HIS equivalence.

## Executive verdict

| Dimension | Score | Notes |
|-----------|-------|-------|
| Layer 1 — Experience | Strong | Web + Next canary + thin native shells; workspace decomposed behind focused modules |
| Layer 2 — Compatibility kernel | Strong | Protocol / view-engine / intelligence / gateway; Session JSON-RPC only |
| Layer 3 — Authority | Strong (boundary) | trytond + PostgreSQL SoT preserved; GH `health` slice verified synthetically |
| Sao/client depth | Good+ / RC | L1–L7 program closed; nested Screen exit integrity closed |
| Security / minimization | Hardened baseline | Memory-only sessions; purge on logout/401; CSP + gateway caps |
| Release / promotion | Candidate, not authorized | Local gates green in prior receipts; `main` unpublished; native first-green + signed promotion pending |
| PHI / HIS | **Not claimed** | A-01 open by design |

**Overall:** Epitón is a mature **Tryton-compatible client platform** with a
reproducible release-candidate posture on synthetic labs (Tryton 7/8 + pinned
GNU Health `health` slice). It is **not** a clinical system of record, not a
Sao/GTK fork, and not production-authorized until remote CI, native promotion
evidence, and human ops gates land.

## Repository snapshot (local)

```text
Audited base: 38455c9 feat(release): enforce native promotion evidence
Publication:  local main only; protected native-candidate delta included here
              remains unpublished (no push)
LOC approx (ts/tsx/rs, excl. node_modules/target):
  apps/web            ~13.4k
  packages/view-engine ~7.4k
  packages/protocol    ~3.9k
  apps/gateway         ~0.7k
  packages/ui          ~0.5k
  packages/intelligence ~0.3k
  apps/desktop/mobile  thin adapters
ModelWorkspace.tsx:   ~2307 lines (coordinator; extracts under modelWorkspace/)
E2E specs:            12 Playwright entrypoints
Docs hub:             17 markdown files under docs/
```

Evidence anchors: `COMPATIBILITY.md`, `TRYTON_AHEAD.md`, `THREAT_MODEL.md`,
`CHILD_SCREEN_CONTRACT.md`, `GOVERNANCE.md`, `AGENT_BRIDGE.md` (solo-Codex ledger),
`.github/workflows/ci.yml`, `config/native-release-promotion.json`.

---

## Layer 1 — Experience

**Owner:** `apps/web` (Vite release + Next App Router canary), `@epiton/ui`,
Tauri/Capacitor shells.

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| L1-01 Shared `EpitonClient` across Vite/Next | Strength | Closed | `apps/web/app`, `mount.tsx`; N0/N1 receipts |
| L1-02 Workspace monolith reduced via extracts | Strength | Closed enough | `modelWorkspace/*` (lifecycle, save, selection, toolbar, search, filters, history, navigation) |
| L1-03 Nested relation dirty-exit integrity | Strength | Closed | G-01 delta 2026-08-02; parent Save blocked until line accepted |
| L1-04 Dense forms + domain filter builder | Strength | Closed | L4/L5; `form-layout` / `filter-builder` e2e |
| L1-05 Board / wizard / report / calendar hosts | Strength | Closed | L1.2–L1.4 / L6; mock suite |
| L1-06 Next host CSP nonce + PWA static-only | Strength | Closed (web) | `test:e2e:next` 15/15 prior receipt |
| L1-07 Native shells thinner than web | Medium (product) | Open as depth | Protected candidate producer and promotion verifier are defined; first-green signed/device receipts remain external |
| L1-08 ModelWorkspace still large coordinator | Low | Residual | ~2.3k lines; further extract optional, not a wire blocker |
| L1-09 UI recipe consolidation | Low | Open | Prefer `@epiton/ui` Dialog recipes over duplicated wrappers |

**Layer 1 verdict:** Production-web experience is deep and evidenced. Native is
packaging-complete in CI definitions but not promotion-authorized. Do not fork
Tryton behavior per host.

---

## Layer 2 — Compatibility kernel

**Owner:** `@epiton/protocol`, `@epiton/view-engine`, `@epiton/intelligence`,
`apps/gateway`.

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| L2-01 Session JSON-RPC + auto path fallback | Strength | Closed | Tryton 7/8 live 21/21 |
| L2-02 Strict RPC correlation / envelope | Strength | Closed | B-03 |
| L2-03 Child Screen contract frozen | Strength | Closed | `CHILD_SCREEN_CONTRACT.md`; O2M/M2M one parent write |
| L2-04 PYSON / domains / typed filter encode | Strength | Closed | view-engine + L5 |
| L2-05 Gateway: rate/body/response caps, ACL coach | Strength | Closed | S-02/B-06; gateway tests |
| L2-06 Intelligence advisory-only | Strength | Closed | No auto create/write/delete |
| L2-07 REST Bearer | Info | Not probed | A-04 — do not claim |
| L2-08 Tryton 9 | Info | Future canary | `tryton-series-policy.json`; waiting |
| L2-09 Proteus | Process | Lab oracle only | Never in protocol/web runtime |

**Layer 2 verdict:** Kernel faithfully translates Sao-shaped Session contracts
without owning business truth. Gateway is the required production-web edge.

---

## Layer 3 — Authority (trytond / PostgreSQL)

**Owner:** trytond modules + PostgreSQL. Epitón must not duplicate.

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| L3-01 trytond is sole SoT | Strength | Closed (design) | CANON / GOVERNANCE / AGENTS |
| L3-02 Live CRUD on Tryton 7/8 labs | Strength | Closed | compat:live + browser CRUD |
| L3-03 `_timestamp` concurrency on GH clinical writes | Strength | Closed | GH audit delta 2026-08-02 |
| L3-04 Correlated audit without clinical payloads | Strength | Closed | Gateway header + Tryton context UUID; no body PHI |
| L3-05 GNU Health core `health` synthetic acceptance | Medium (claim boundary) | Closed for slice | Browser 3/3 + PG acceptance; **not** PHI |
| L3-06 Broader gnuhealth.* module set | Medium | Open | Roadmap; metadata discovery ≠ clinical claim |
| L3-07 Production IdP / TLS / rotation / incidents | High (ops) | Open | Human ops; not client depth |
| L3-08 PHI / clinical / regulatory approval | High (claim) | **Blocked** | A-01 |

**Layer 3 verdict:** Client correctly defers authority. Synthetic GH evidence
raises confidence for a disposable lab slice only.

---

## Cross-cutting risk register (current)

| ID | Layer | Severity | Finding | Mitigation / next |
|----|-------|----------|---------|-------------------|
| A-01 | 3 / claim | High | No PHI/HIS certification | Never market as Epione; keep synthetic labs |
| R-01 | 1 | Medium | Protected native candidate first-green + signed promotion pending | Manual workflow, `check:native-promotion`, human approvals |
| R-02 | 1–2 | Medium | Local `main` ~86 ahead of `origin` | Human decides push / CI green |
| R-03 | 2 | Info | REST Bearer not probed | Session + gateway only |
| R-04 | 2 | Info | Tryton 9 not claimed | Official canary waiting |
| R-05 | 1 | Low | Formal WCAG / field perf not claimed | Release e2e budgets ≠ certification |
| R-06 | 3 | Medium | GH modules beyond central `health` | Separate pinned labs per module |
| A-08 | Ops | Process | Synthetic lab credentials | Never reuse in shared/prod |

## Closed since evening 2026-07-31 program (summary)

L1.3 wizard/report · L1.4 calendar · L2 workspace extracts · L3 nested Screen
(+ exit integrity) · L4 dense forms · L5 domain builder · L6 board polish
(earned) · L7 release budgets/threat model · backend-authority minimization ·
GH `health` synthetic gate · native artifact attestation + promotion verifier
(local).

## Recommended human order

1. Publish / CI: get remote `build-test`, gateway, ordinary native, and protected
   candidate producers green once.
2. Native promotion: collect signed candidates + device authorities per
   `config/native-release-promotion.json` — fail-closed until complete.
3. Keep A-01 / REST / Tryton 9 / broader GH modules out of marketing claims.
4. Optional client polish: further ModelWorkspace leaf extraction; `@epiton/ui`
   Dialog consolidation.
5. Ops: threat-model exercises, IdP/TLS runbooks, incident drills — separate
   from client depth.

## Explicit non-goals (unchanged)

Sao/GTK GPL import · Proteus in product runtime · Intelligence auto-writes ·
Client SQL / second store · PHI fixtures · force-push / prod promotion without
explicit human order · claiming Epione HIS equivalence.
