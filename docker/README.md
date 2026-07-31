# Epiton trytond lab

Synthetic local stack for protocol fixtures and UI development.

```bash
pnpm lab:up
```

- PostgreSQL: `localhost:5433` / user `tryton` / password `tryton` / db `epiton_lab`
- trytond HTTP: `http://localhost:8000`
- Admin login (lab only): user `admin` / password `admin` / email `admin@gmail.com` (synthetic bootstrap; change in shared envs)

Epiton web defaults:

- Gateway: `http://localhost:8080`
- Database: `epiton_lab`

Production web requires the same browser → same-origin edge → gateway shape;
direct trytond URLs are limited to controlled development and native shells.

No real personal or clinical data. Fixtures under `tests/compat/fixtures` are synthetic JSON-RPC traces.

GNU Health is **not** in the default image. See `docs/GNU_HEALTH.md` and
`pnpm gh:check`; the stock lab is expected to return exit code `2`.

## Supported series

```bash
pnpm lab:up             # Tryton 7: trytond :8000, gateway :8080
pnpm lab:up:8           # Tryton 8: trytond :8001, gateway :8081
pnpm lab:oracle:7       # pinned Proteus 7 reference oracle
pnpm lab:oracle:8       # pinned Proteus 8 reference oracle
pnpm lab:down
```

Tryton 8 uses `epiton_lab8`, PostgreSQL port `5434`, and a separate volume.
The Proteus services are isolated, one-shot compatibility oracles using only
synthetic records; Proteus is not a runtime dependency.

## Smoke

```bash
curl -s -X POST http://localhost:8080/epiton_lab/rpc/ \
  -H 'Content-Type: application/json' \
  -d '{"id":1,"method":"common.server.version","params":[]}'
```
