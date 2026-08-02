# Epitón governance

Controls for promotion, data, licensing, and agent authority. Complements
[`CANON.md`](CANON.md). Epitón is a **client**; trytond remains the system of
record.

## Principles

1. **Trytond is truth** — no client bypass of ACLs, wizards, or audit.
2. **No Sao/GTK copy** — Apache-2.0 Epitón code only; reimplement against RPC.
3. **No real PHI/PII** in repo, fixtures, screenshots, logs, or agent prompts.
4. **Intelligence never auto-writes** clinical or business records.
5. **Least privilege for agents** — no secret exfiltration, no prod access by default.
6. **Synthetic lab first** — default docker credentials are lab-only.

## Data classes

| Class | Examples | Allowed in git / CI | Allowed in agent context |
|-------|----------|---------------------|---------------------------|
| Public / brand | `docs/BRAND.md`, marketing copy | Yes | Yes |
| Synthetic lab | `admin`/`admin` lab user, fixture RPC traces | Yes (labelled) | Yes |
| Connection prefs | baseUrl + database name | Yes (local only) | Yes |
| Session token | JSON-RPC Session | **No** | Memory only; never commit |
| Real PHI / PII | Patient charts, real emails/phones | **No** | **No** |
| Prod secrets | TLS keys, IdP client secrets | **No** | **No** |

Lab passwords in `docker/README.md` are **synthetic bootstrap**. Rotate before
any shared or internet-exposed environment.

## Environments

| Env | Purpose | Gate |
|-----|---------|------|
| Local web | `pnpm dev` against lab or gateway | `pnpm lint` + `pnpm test` while iterating |
| Lab trytond 7 | `pnpm lab:up` | `pnpm lab:smoke:live` |
| Lab trytond 8 | `pnpm lab:up:8` | Same supported protocol/oracle/browser gates as 7 |
| CI | GitHub Actions `ci.yml` | lint/typecheck/test/build, Rust gateway, Tryton 7/8 matrix |
| Production | Ops-owned trytond + TLS + gateway | Explicit human promotion; not agent-default |

Agents **do not** promote production, rotate secrets, or open PHI datasets
unless a human explicitly authorizes that exact action in the request.

## Approvals

| Change type | Who can merge | Extra requirement |
|-------------|---------------|-------------------|
| Docs / brand / tooling eval | Maintainer | Link CANON if authority shifts |
| Client parity (RPC/UI) | Maintainer | Update `COMPATIBILITY.md`; pass CI |
| Gateway ACL / CORS / rate limits | Maintainer + security-aware review | Note threat impact in PR |
| New runtime dependency | Maintainer | Entry in `TOOLING.md` (allow or reject) |
| GNU Health lab / `gnuhealth.*` claims | Maintainer | Update `GNU_HEALTH.md`; metadata first; no PHI fixtures |
| Claiming “PHI ready” / clinical compliance | **Blocked** until separate HIS governance | Epitón alone cannot clear this |
| License exception / Sao paste | **Forbidden** | — |

## License governance

- Epitón: Apache-2.0.
- trytond and official Tryton modules: their upstream licenses (typically GPL).
- Do not vendor Sao or tryton-client GTK sources.
- Compatibility means **wire-level** and UX parity, not code derivation.

When in doubt: read the Tryton docs / live RPC, then write original TypeScript.

## Security controls (client + gateway)

| Control | Location |
|---------|----------|
| Session in memory (web) | `@epiton/web` store |
| Session in memory (desktop/mobile beta) | Persistence APIs disabled; exact deletion-only legacy cleanup, never hydration |
| Client projections in memory | TanStack Query / Zustand / component state; never persisted or encoded in URL history |
| Authentication boundary purge | Logout, authenticated 401, and page lifecycle teardown clear user-scoped state |
| Strict JSON-RPC response contract | Matching request id; exactly one `result` or `error`; typed login and row shapes |
| RPC / bus transport privacy | `cache: no-store`, `credentials: omit`, `referrerPolicy: no-referrer` |
| PWA static assets only | Service worker has no runtime cache for RPC, bus, auth, or dynamic responses |
| Block `javascript:` URLs | protocol / view-engine guards |
| CORS allowlist | `EPITON_CORS_ORIGINS` |
| Login rate limit | gateway |
| Body size limit | gateway |
| Correlation id | `X-Correlation-Id` |
| Deny-only strict ACL guard on mutations | `EPITON_STRICT_ACL=true` |
| Bundle size budget | `pnpm check:bundle` |
| CSP topology | Production browser must use same-origin edge → gateway → trytond |

Audit logs on the gateway must not include response bodies or PHI payloads.

## Intelligence governance

From [`INTELLIGENCE.md`](INTELLIGENCE.md):

- Suggestions and search are advisory.
- Never call `create` / `write` / `delete` / `copy` / `import_data` from
  suggestion code paths without an explicit user gesture in the UI.
- No PHI/PII in telemetry or embeddings (future embeddings: titles/menus only).

## Analytics / boards governance

- Charts and board panes aggregate **`search_read` / `search_count`** results.
- They are **not** a warehouse, OLAP cube, or second SoT.
- Layout and analytic projections live in process memory only. Never sync them,
  record identifiers, or payloads to browser/native persistence or third parties.

## Incident / stop conditions

Stop the batch and surface to the human if:

- Real PHI appears in a fixture, log, screenshot, or commit
- A change would talk to production trytond without explicit ask
- Sao/GTK source is about to be pasted
- A new ORM/DB client would bypass trytond
- Overlap with uncommitted foreign work cannot be resolved safely

## Document ownership

| Doc | Owner intent |
|-----|--------------|
| `GOVERNANCE.md` | Promotion, PHI, license, agent authority |
| `CANON.md` | SoT map and doc index |
| `COMPATIBILITY.md` | Feature parity status |
| `AUDIT.md` | Dated findings (append or replace with new date) |
