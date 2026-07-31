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
