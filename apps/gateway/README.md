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
- Login rate limiting
- Body size limit
- CORS
- Audit log lines (method, rpc, status, latency) without response bodies
- **Strict ACL**: mutating `model.*` calls probe `ir.model.access`; deny when no rows (`EPITON_STRICT_ACL=true`)
