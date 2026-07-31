# Epiton trytond lab

Synthetic local stack for protocol fixtures and UI development.

```bash
docker compose up -d
```

- PostgreSQL: `localhost:5433` / user `tryton` / password `tryton` / db `epiton_lab`
- trytond HTTP: `http://localhost:8000`
- Admin login (lab only): user `admin` / password `admin` / email `admin@gmail.com` (synthetic bootstrap; change in shared envs)

Epiton web defaults:

- Server: `http://localhost:8000`
- Database: `epiton_lab`

No real personal or clinical data. Fixtures under `tests/compat/fixtures` are synthetic JSON-RPC traces.

## Smoke

```bash
curl -s -X POST http://localhost:8000/epiton_lab/rpc/ \
  -H 'Content-Type: application/json' \
  -d '{"id":1,"method":"common.server.version","params":[]}'
```
