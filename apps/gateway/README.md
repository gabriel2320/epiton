# epiton-gateway

Rust (Axum) reverse proxy in front of trytond.

```bash
# local (requires Rust toolchain)
cd apps/gateway
EPITON_UPSTREAM=http://127.0.0.1:8000 cargo run --release --locked

# via lab compose
cd docker && docker compose up -d --build gateway
curl http://127.0.0.1:8080/healthz
```

Listens on `0.0.0.0:8080` by default.

Features:

- Dual RPC routes: `/{db}/` and `/{db}/rpc/`
- Correlation id (`X-Correlation-Id`)
- Login rate limiting by peer IP; `X-Forwarded-For` is accepted only with
  `EPITON_TRUST_PROXY=true`
- Configurable request and response limits plus upstream timeouts
- Explicit CORS allowlist (`EPITON_CORS_ORIGINS`); empty means same-origin and
  `*` is rejected
- Audit log lines (method, rpc, status, latency) without response bodies
- Security response headers, POST-only RPC routes, validated database paths and
  JSON-RPC envelopes
- Optional **strict ACL compatibility guard**: mutating `model.*` calls probe
  `ir.model.access` and can only add a denial (`EPITON_STRICT_ACL=true`).
  trytond remains the authorization authority and the option defaults to false.

## `STRICT_ACL` policy

`EPITON_STRICT_ACL=false` does **not** bypass Tryton permissions: every request
still reaches trytond with the user's Session and trytond makes the final ACL
decision. The flag controls an additional deny-only gateway guard.

- **Synthetic lab:** keep it `false`. Stock/minimal databases may legitimately
  have no `ir.model.access` row for a model and Tryton then applies its own
  default behavior; enabling the guard would reject those lab mutations before
  trytond sees them.
- **Production:** choose the value explicitly during deployment. Enable `true`
  only after verifying that every model users must mutate has intentional
  `ir.model.access` metadata. In strict mode a missing row or failed metadata
  probe is fail-closed; the guard can deny access but can never grant it.

This flag is a defense-in-depth compatibility policy, not a substitute for
complete Tryton groups, rules, access rows, TLS, or edge controls.

## Payload limits

`EPITON_MAX_BODY_BYTES` limits requests (16 MiB by default), while
`EPITON_MAX_RESPONSE_BYTES` bounds every buffered upstream response (64 MiB by
default). The response limit is also enforced while streaming chunks, so a
missing or dishonest `Content-Length` cannot grow gateway memory without a
bound. Oversized upstream responses fail with `502 Bad Gateway`; deployments
may lower the cap after validating their largest report payload.

Terminate TLS at a reverse proxy (Caddy/nginx) in front of this gateway; the process itself speaks HTTP.

## Frontend CSP

Production Epiton web requires **browser → same-origin reverse proxy → gateway
→ trytond** so CSP `connect-src 'self'` stays tight. The browser never receives
the upstream trytond address. See `docs/COMPATIBILITY.md`.

Do not expose this HTTP listener directly to the public internet. Terminate TLS,
set request limits at the edge as well, and leave `EPITON_CORS_ORIGINS` empty for
the normal same-origin deployment.
