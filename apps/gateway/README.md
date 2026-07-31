# epiton-gateway

Rust (Axum) reverse proxy in front of trytond.

```bash
# local (requires Rust toolchain)
cd apps/gateway
EPITON_UPSTREAM=http://127.0.0.1:8000 EPITON_STRICT_ACL=true cargo run --release

# via lab compose
cd docker && docker compose up -d --build gateway
curl http://127.0.0.1:8080/healthz
```

Listens on `0.0.0.0:8080` by default.

Features:

- Dual RPC routes: `/{db}/` and `/{db}/rpc/`
- Correlation id (`X-Correlation-Id`)
- Login rate limiting (keyed by `direct` unless `EPITON_TRUST_PROXY=true`, then `X-Forwarded-For`)
- Body size limit
- CORS allowlist (`EPITON_CORS_ORIGINS`, default localhost Vite ports — not `*`)
- Audit log lines (method, rpc, status, latency) without response bodies
- **Strict ACL**: mutating `model.*` calls (create/write/delete/copy/import/button_*) probe `ir.model.access`; deny when no rows (`EPITON_STRICT_ACL=true`)

Terminate TLS at a reverse proxy (Caddy/nginx) in front of this gateway; the process itself speaks HTTP.

## Frontend CSP

Production Epiton web prefers **browser → gateway → trytond** so CSP `connect-src 'self'` stays tight. See `docs/COMPATIBILITY.md`.
