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

## Production deployment checklist

Start from [`config/gateway-production.env.example`](../../config/gateway-production.env.example)
and review every value; it is a baseline, not a file to deploy unchanged.

- [ ] Put a TLS/HSTS edge in front of Epitón and route browser RPC/bus traffic
      through the same public origin. Keep `EPITON_CORS_ORIGINS` empty unless a
      separately reviewed client origin is unavoidable.
- [ ] Bind the gateway to loopback when the edge runs on the same host. In a
      container network, bind only as required and enforce a private network
      policy; never publish the listener directly to the internet.
- [ ] Keep `EPITON_UPSTREAM` on a private route. The value must be a deliberate
      HTTP(S) trytond endpoint without credentials, query, or fragment. Restrict
      gateway egress and protect internal DNS.
- [ ] Set `EPITON_TRUST_PROXY=true` only when the known edge strips and replaces
      inbound forwarding headers. Otherwise leave it false so rate limiting
      uses the socket peer.
- [ ] Choose `EPITON_STRICT_ACL` explicitly. The baseline recommends `true` only
      after proving that every intended mutable model has deliberate
      `ir.model.access` metadata; first validate with the actual production
      groups because strict mode is fail-closed.
- [ ] Size body, response, timeout, login-rate, edge concurrency, and edge body
      limits from legitimate workloads, including the largest report. Do not
      remove the application caps to accommodate one report.
- [ ] Keep payload logging disabled. Route correlation/status/latency logs to an
      access-controlled sink with documented retention and alerting; verify
      `/healthz` from inside the trusted network.
- [ ] Supply the web CSP/security headers at the edge or qualified Next host,
      keep dependencies and base images patched, and run JavaScript/Rust
      advisory gates on the exact release revision.
- [ ] Run lint, unit, build, bundle, mock/release browser, supported Tryton 7/8
      live, and locked gateway gates. Record the source revision and CI run;
      separately verify native signing/device behavior for a native release.
- [ ] Document rollback, trytond/database backup ownership, credential/session
      invalidation, and an incident contact. The client is not a backup or
      business system of record.

The focused threat analysis and residual risks live in
[`docs/THREAT_MODEL.md`](../../docs/THREAT_MODEL.md). Production promotion,
secret rotation, penetration testing, and PHI/clinical certification require
separate human governance.
