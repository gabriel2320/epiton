# Epitón client and gateway threat model

Versioned baseline: 2026-08-02. This model covers the Epitón web client,
desktop/mobile beta shells, and the Axum gateway. It does not certify trytond,
PostgreSQL, an edge proxy, an identity provider, a device, or a particular
production deployment.

## Security objective

Epitón must remain a non-authoritative Tryton client. A user may see or request
only what trytond authorizes for that Session; the client and gateway must not
create a second business store, broaden an ACL decision, retain a Session after
its lifecycle, or expose the private trytond endpoint to the production browser.

Protected assets are Session credentials, login credentials in transit,
business/clinical RPC payloads, user-scoped UI projections, exports, Tryton ACL
decisions, gateway capacity, and the integrity of shipped client artifacts.

## Data flow and trust boundaries

```text
Untrusted browser
  -> TLS + same-origin edge (deployment boundary)
  -> Epitón gateway (request validation, limits, optional deny-only ACL guard)
  -> private trytond (authentication, ACL/rules, business authority)
  -> PostgreSQL (owned only by trytond)

Desktop/mobile beta shell
  -> controlled gateway or trytond endpoint
  -> the same trytond authority
```

The browser, native WebView, network, edge headers, RPC input, Tryton metadata,
and dependency/build inputs are untrusted. The gateway may trust forwarded
client IPs only when a known edge strips inbound forwarding headers and
`EPITON_TRUST_PROXY=true` is an explicit deployment choice.

## Assumptions and exclusions

- Production browser traffic uses TLS and a same-origin edge; trytond and the
  gateway listener are not public internet endpoints.
- trytond groups, rules, model access, credential policy, backups, and database
  hardening are operated independently and remain authoritative.
- The deployment supplies no credentials in `EPITON_UPSTREAM` and protects its
  environment, network, DNS, logs, build system, and signing keys.
- No claim is made for penetration testing, WCAG conformance, PHI readiness,
  clinical certification, native device acceptance, release signing, edge
  DDoS capacity, IdP integration, or secret rotation.

## Threat register

| ID | Threat | In-repository controls and evidence | Residual risk / required operation |
|----|--------|-------------------------------------|------------------------------------|
| T-01 | Session or payload theft through durable client state or a later user | Session and user projections stay in memory; logout, authenticated 401, and page teardown purge protocol/query/UI state; legacy storage paths are deletion-only; the compatibility contract scans browser/native persistence surfaces. | XSS, a compromised process, crash dump, browser extension, or device compromise can still observe live memory. Patch dependencies and protect endpoints. |
| T-02 | Cross-site request abuse or origin confusion | RPC uses an explicit `Authorization: Session` header with ambient credentials omitted; fetches are `no-store` with no referrer; normal production CORS is empty and the browser connects only to its same origin. | An in-origin script can act with the live Session. The edge must preserve the same-origin topology and a strict CSP. |
| T-03 | Credential stuffing or login exhaustion | The gateway rate-limits login per observed peer address and trusts `X-Forwarded-For` only when configured. | Distributed attacks and a misconfigured trusted proxy exceed the in-process limiter. The edge needs its own rate/DDoS controls and canonical client-IP handling. |
| T-04 | Authorization bypass or gateway policy drift | trytond receives the Session and remains the final ACL/rule authority. `EPITON_STRICT_ACL=true` adds only denials for mutating model calls and fails closed on metadata probe failure; it never grants access. Gateway tests cover its decision logic. | Incorrect Tryton ACL/rules remain authoritative mistakes. Strict mode can deny legitimate work when access metadata is incomplete, so production access rows must be audited before activation. |
| T-05 | Malformed RPC, method confusion, or database-path injection | Gateway RPC routes are POST-only; database paths, JSON content type, JSON-RPC envelopes, and client response ids/result-error exclusivity are validated. | Business-valid but malicious parameters are still handled by trytond and its modules. Keep supported Tryton series patched and run live compatibility gates. |
| T-06 | Gateway used as an SSRF/open-redirect proxy | `EPITON_UPSTREAM` is deployment-owned, limited to HTTP(S), and rejects credentials, query, and fragment; the HTTP client does not follow redirects. The browser never supplies the upstream. | DNS and network compromise can redirect an allowed hostname. Pin private routing/DNS and restrict gateway egress to intended trytond addresses. |
| T-07 | Memory/latency denial through large or stalled requests | Configurable request and response caps, a five-second upstream connect timeout, configurable request timeout, bounded response streaming, and login rate limiting fail requests instead of allowing unbounded buffering. | Each accepted concurrent request may still consume its configured cap. Size limits against legitimate reports and enforce concurrency/body/time limits at the edge. |
| T-08 | Sensitive values disclosed in observability | Gateway audit lines contain correlation id, method/RPC name, status, and latency, not request/response bodies; security responses use `no-store`. | Upstream/application diagnostics and edge logs are separately operated. Never enable payload logging and treat model/method names as potentially sensitive metadata. |
| T-09 | Cross-session stale UI or confused-deputy mutations | Authentication-boundary purge, request correlation, last-request-wins workspace guards, origin record ids, and strict row/envelope decoding prevent older responses from silently targeting newer UI state. | Concurrency bugs outside covered flows remain possible. Unit, mock-browser, and live-lab receipts are release gates. |
| T-10 | Compromised dependency, build, or service worker | Pinned lockfiles, production JavaScript advisory audit, RustSec, unit/build gates, bundle budget, and CI-built native artifacts are defined. The PWA precaches versioned static assets only and has no RPC/auth runtime cache. | Advisory databases are not a proof of supply-chain integrity. Protect CI, review lockfile changes, sign releases, and verify provenance before production promotion. |
| T-11 | Exported data survives the client lifecycle | Downloads require an explicit user gesture and are not used as client state or a system of record. | Once downloaded, the file belongs to browser/OS/user retention policy. Production must govern endpoint storage, sharing, malware scanning, and deletion. |
| T-12 | Native WebView persistence or artifact substitution | Desktop/mobile sessions remain in memory; legacy cleanup APIs remove exact historical entries without hydration. CI defines Android APK and Linux Tauri bundle producers. | Real-device lifecycle, OS backup behavior, signing, distribution, and first-green artifact receipts are separate promotion gates. |

## Automated release baseline

`pnpm test:e2e:release` runs the primary browser path through the deterministic
mock gateway. It checks login and navigation by keyboard, visible semantic
landmarks, duplicate DOM ids, accessible names for interactive accessibility
tree nodes, DOM size, navigation/workflow timings, long tasks, and cumulative
layout shift. The versioned limits live in
[`config/client-release-budgets.json`](../config/client-release-budgets.json),
and the test emits a machine-readable `client-release-metrics` line plus a JSON
attachment.

This is a regression baseline in the CI Chromium environment. It is not a full
accessibility audit, assistive-technology matrix, real-user performance study,
or WCAG conformance statement. Manual screen-reader, zoom/reflow, contrast,
device/network, and task-specific review remain part of production acceptance.

## Production acceptance

Before promotion, complete the gateway checklist in
[`apps/gateway/README.md`](../apps/gateway/README.md), run the repository gates
in [`AGENT_LOOP.md`](AGENT_LOOP.md), review every open/residual item above, and
record the exact source revision plus CI artifact/run links. A material change
to authentication, persistence, CORS/CSP, proxy trust, gateway limits, upstream
routing, ACL enforcement, exports, native bridges, or a new data sink requires
a threat-model review.
