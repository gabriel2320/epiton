# Epitón Agent Guide

Non-negotiable rules for AI coding agents working in this repository.

## Canonical sources

- This file — hard rails for agents.
- [`docs/AGENT_LOOP.md`](docs/AGENT_LOOP.md) — local loop and gates (speed).
- [`docs/CANON.md`](docs/CANON.md) — product SoT map and doc index.
- [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) — promotion, PHI, license, stop conditions.
- [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) — parity status; update when status changes.
- [`docs/TOOLING.md`](docs/TOOLING.md) — library allow/deny before adding deps.
- Do **not** invent a parallel roadmap; persist durable state in those docs.

## Product rails

- Epitón is a **Tryton-compatible client**. **trytond** is the only business/clinical truth.
- Talk to the server via **JSON-RPC Session** (`@epiton/protocol`). Prefer Sao-shaped
  params; **never copy Sao/GTK GPL source**.
- Epitón is **not** Epione HIS. Do not claim PHI readiness or clinical compliance.
- Apache-2.0 for Epitón code only.

## Forbidden

- Real PHI/PII in code, fixtures, logs, screenshots, or prompts.
- Session tokens in `localStorage` (only `epiton.connection` baseUrl/database).
- SQLAlchemy, Alembic, Pydantic, NumPy, WeasyPrint, ReportLab, FastAPI in the
  **client runtime** (see `docs/TOOLING.md`).
- Intelligence auto-`create` / `write` / `delete` / `copy` / `import_data`.
- Client SQL or a second authoritative store beside trytond.
- `push --force` to `main`, production promotion, secret rotation, or prod data
  access unless the human explicitly requested that exact action.
- New root scripts / parallel harnesses without an existing orchestrator pattern.

## Architecture preferences

- Modular monorepo: change the smallest package that owns the concern
  (`protocol` / `view-engine` / `ui` / `intelligence` / `web` / `gateway`).
- OpenAPI is irrelevant here; **RPC + Tryton views** are the contract.
- UI states loading / error / empty / data are exclusive per panel.
- Analytics/boards visualize `search_read` — they are not a warehouse.
- Prefer recipes in `@epiton/ui` over dumping full shadcn trees.

## Execution

- If the goal and scope are clear: inspect → implement → verify → close the batch.
  Do not ask for intermediate confirmations on reversible details.
- Make reversible assumptions; document them in the delivery. Ask only when a
  decision changes authority, license, PHI, or production blast radius.
- Fix failures caused by the batch and re-run the relevant gate. Do not abandon
  after the first reproducible failure.
- Subagents may handle bounded search/review/tests. Do not parallel-edit the same
  files. Consolidate evidence in the parent agent.
- Local commits after a verified batch are allowed when the user pattern is
  “continua / ship”. Do not push or open/merge PRs unless asked (user may
  already expect push-to-`main` in this project — follow the explicit user rule
  for the session).
- Preserve unrelated dirty work; stop on unsafe overlap.

## Minimum gates

See [`docs/AGENT_LOOP.md`](docs/AGENT_LOOP.md).

- Iterate with `pnpm lint` and focused package tests.
- Close a batch with `pnpm lint && pnpm test && pnpm --filter @epiton/web build && pnpm check:bundle`.
- Gateway changes: `cargo test` / `cargo check` in `apps/gateway`.
- RPC contract changes: prefer `pnpm lab:smoke:live` when docker lab is available.
- Do not rely on GitHub Actions as the daily loop; CI is the merge/promotion net.

## Documentation duty

When a batch changes behavior:

1. Update `docs/COMPATIBILITY.md` if parity status changed.
2. Update `docs/TOOLING.md` if dependencies changed.
3. Update `docs/AUDIT.md` only for intentional re-audits (new date section) or
   leave findings to the next dated audit.
4. Keep `README.md` as the hub; put depth in `docs/*`.
