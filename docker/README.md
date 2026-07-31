# Epiton trytond lab

Synthetic local stack for protocol fixtures and UI development.

```bash
docker compose up -d
```

- PostgreSQL: `localhost:5433` / user `tryton` / password `tryton` / db `epiton_lab`
- trytond HTTP: `http://localhost:8000`
- Default admin password is set by the Tryton image/admin bootstrap (change immediately in shared environments)

Epiton web login defaults:

- Server: `http://localhost:8000`
- Database: `epiton_lab`

No real personal or clinical data. Fixtures under `tests/compat/fixtures` are synthetic JSON-RPC traces.
