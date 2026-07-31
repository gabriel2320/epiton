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
- Configurable body limit and upstream timeouts
- Explicit CORS allowlist (`EPITON_CORS_ORIGINS`); empty means same-origin and
  `*` is rejected
- Audit log lines (method, rpc, status, latency) without response bodies
- Security response headers, POST-only RPC routes, validated database paths and
  JSON-RPC envelopes
- Optional **strict ACL compatibility guard**: mutating `model.*` calls probe
  `ir.model.access` and can only add a denial (`EPITON_STRICT_ACL=true`).
  trytond remains the authorization authority and the option defaults to false.

Terminate TLS at a reverse proxy (Caddy/nginx) in front of this gateway; the process itself speaks HTTP.

## Frontend CSP

Production Epiton web requires **browser → same-origin reverse proxy → gateway
→ trytond** so CSP `connect-src 'self'` stays tight. The browser never receives
the upstream trytond address. See `docs/COMPATIBILITY.md`.

Do not expose this HTTP listener directly to the public internet. Terminate TLS,
set request limits at the edge as well, and leave `EPITON_CORS_ORIGINS` empty for
the normal same-origin deployment.
