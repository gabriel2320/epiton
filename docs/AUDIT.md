# Epitón audit — 2026-07-31

Scoped review of the Epitón monorepo as a **Tryton-compatible client**
(not a HIS, not a second database, not a Sao/GTK fork).

## Verdict

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture fit | Strong | JSON-RPC Session → trytond; Axum gateway optional |
| Sao parity (P0/P1) | Good | CRUD, views, wizards, reports, boards, analytics hosts |
| Security posture | Acceptable for lab / careful prod | Session in memory (web); gateway ACL + CSP path |
| PHI readiness | **Not claimed** | Synthetic lab only; GH optional and ungated |
| License hygiene | Strong | Apache-2.0 client; no Sao/GTK copy |
| Agent operability | Was weak → now documented | See `AGENTS.md`, `docs/CANON.md`, `docs/GOVERNANCE.md` |
| Docs completeness | Was fragmented → hubbed | README is the index |

**Overall:** ready as a modern Tryton **client platform** against synthetic labs
and controlled trytond deployments. **Not** a clinical system of record and
**not** a substitute for Epione HIS governance.

## What Epitón is / is not

| Is | Is not |
|----|--------|
| Multiplatform UI over Tryton RPC | Owner of clinical/business truth |
| Sao-compatible interaction shape | GPL Sao/GTK source derivative |
| Gateway + CSP helper | Replacement for trytond ACLs |
| Local intelligence (search/layout) | Auto-writer of clinical data |
| GNU Health *compatible path* | Bundled GNU Health product |

## Architecture snapshot

```text
Browser / Tauri / Capacitor
        │
        ▼
  @epiton/web (React)
        │  @epiton/protocol  JSON-RPC Session
        ▼
  apps/gateway (Axum)  ──optional──►  trytond  ──►  PostgreSQL
```

Packages: `protocol`, `view-engine`, `ui`, `intelligence`.
Apps: `web`, `desktop` (Tauri), `mobile` (Capacitor), `gateway` (Rust).

## Strengths observed

1. Clear SoT boundary: mutations go through Tryton models/wizards/reports.
2. Broad client parity matrix (`docs/COMPATIBILITY.md`) with live lab smoke in CI.
3. Gateway features: correlation id, rate limit, body limit, CORS allowlist,
   optional strict ACL on mutating RPC.
4. Explicit rejection of parallel Python ORM/report stacks (`docs/TOOLING.md`).
5. Board analytics + graph arch stay on `search_read` / `fields_view_get`
   (visual only; no client warehouse).
6. Session tokens not in `localStorage` (web memory; Tauri/Capacitor OS store via bridge).

## Gaps and risks

| ID | Severity | Finding | Mitigation |
|----|----------|---------|------------|
| A-01 | High (product claim) | No production PHI/HIS certification | Do not market as Epione; keep GH Phase 4 |
| A-02 | Low | Board panes were analytics-only | **Closed enough:** embedded tree/graph/form + multi-y |
| A-03 | Low | Graph multi-y / `_actions` incomplete | **Closed enough:** `_actions` + heuristics + multi-y |
| A-04 | Medium | REST Bearer path “not probed” | Prefer gateway Session; probe before claiming |
| A-05 | Low | Desktop/mobile thinner than web | **Improved:** secure session hydrate + title/safe-area; still thin hosts |
| A-06 | Low | pdfjs unused vs iframe | **Closed:** `PdfPreview` page/zoom with iframe fallback |
| A-07 | Low | Docs were README-thin for agents | This audit + CANON/GOVERNANCE/AGENTS |
| A-08 | Process | Lab credentials are synthetic defaults | Never reuse in shared/prod envs |

## Security checklist (point-in-time)

- [x] No Sao/GTK GPL source imported
- [x] Session token not in `localStorage`
- [x] `javascript:` blocked on URL actions / binary links (client guards)
- [x] Gateway can deny fail-open mutations when `EPITON_STRICT_ACL=true`
- [x] CI: lint, unit tests, web build, bundle budget, gateway cargo, lab smoke
- [ ] Formal threat model / pen-test (out of scope of this audit)
- [ ] Prod IdP / TLS termination / secret rotation playbooks (ops, not client)

## Recommended next batches (human priority)

1. Live lab smoke: board Open wizard/report, calendar create/drag, print without selection blocked, email keyword hit (`pnpm compat:live` + manual UI).
2. Formalize `@epiton/ui` Dialog recipe; retire duplicated Radix wrappers gradually.
3. Keep GNU Health as probe/matrix only until a dedicated trytond+GH lab exists.
4. REST Bearer remains **Not probed** (A-04) — prefer Session + gateway; do not claim REST parity.
5. Do not market Epitón as PHI/HIS-ready (A-01).

## Lab smoke checklist (manual / Playwright)

When trytond lab is up:

1. Login → database datalist populates if `common.db.list` works.
2. Hierarchical model: expand nodes under two different act_window domains; confirms separate `ir.ui.view_tree_state` rows.
3. Open Reports drawer with no selection → notice; ids field empty (not `1`).
4. Board pane with wizard/report action → **Open wizard/report** runs shell path.
5. Calendar view: click date creates (soft-fail OK); drag moves when model allows write.
6. Form button `type="action"` opens resolveAction path; method buttons still call `model.method`.
7. Attachments: Add link + Open; upload data still works.
8. REST / PHI: no claims — Session only; A-01 still open.

## Evidence anchors

- Compatibility: `docs/COMPATIBILITY.md`
- Tooling rejects: `docs/TOOLING.md`
- Intelligence safety: `docs/INTELLIGENCE.md`
- GH matrix: `docs/GNU_HEALTH.md`
- Gateway: `apps/gateway/README.md`
- Lab: `docker/README.md`
- CI: `.github/workflows/ci.yml`
