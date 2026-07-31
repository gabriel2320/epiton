# Epitón tooling evaluation

Epitón is a **Tryton-compatible client**. Clinical/business truth stays on
**trytond** (JSON-RPC Session). The gateway is **Axum (Rust)**; the UI is
**React + TypeScript**. New libraries must not create a second source of truth
or a parallel Python stack beside trytond.

## Verdict matrix

| Library | Role people hope for | Epitón verdict | Why |
|---------|----------------------|----------------|-----|
| **SQLAlchemy** | ORM / DB access | **Reject (core)** | Would bypass trytond ACLs, PYSON, wizards, and audit. Client talks RPC only. |
| **Alembic** | Schema migrations | **Reject (core)** | Migrations belong to Tryton modules / trytond, not the client. |
| **Pydantic** | Validation models | **Reject (core)** | No Python app layer. Prefer **Zod** (already in `@epiton/web`) for forms. |
| **NumPy** | Numerics / analytics | **Reject (core)** | Client-side charts use Recharts over `search_read`. Heavy analytics stay server-side. |
| **WeasyPrint** | HTML→PDF | **Reject (core)** | Reports run via `report.*.execute` on trytond. Client previews with **pdfjs**. |
| **ReportLab** | PDF generation | **Reject (core)** | Same: server reports, not client PDF authors. |
| **FastAPI** | HTTP API | **Reject (core)** | Gateway is already **Axum**. A second Python API would split auth/CSP/audit. |
| **Tailwind** | Utility CSS | **Keep (already)** | Tailwind CSS **4** is in `@epiton/web` (`@tailwindcss/vite`). |
| **shadcn/ui** | Component recipes | **Adopt selectively** | `@epiton/ui` now ships Input/Badge/Tabs/Separator/MetaStrip (Radix remains in web for dialog/command). Prefer recipes over CLI dump. |

## What to use instead

| Need | Epitón choice |
|------|----------------|
| HTTP gateway / CSP / session proxy | `apps/gateway` (Axum) |
| Form/DTO validation | Zod + react-hook-form |
| UI primitives | `@epiton/ui` (+ Radix where interaction needs it) |
| Styling | Tailwind 4 + CSS variables in `app.css` |
| Tables / virtualization | TanStack Table + Virtual |
| Charts | Recharts (≤500 rows client-side) |
| PDF preview | pdfjs-dist over Tryton report binaries |
| Search | fuse.js + intelligence package |

## Optional future (non-core) niches

These are **not** default dependencies; only consider behind a clear consumer:

- **FastAPI / Pydantic**: research-only sidecar (benchmarks, offline tools), never on the clinical write path.
- **WeasyPrint / ReportLab**: only if a future *offline export lab* must render PDFs without trytond — still not for production HIS writes.
- **NumPy**: only in a research notebook/worker outside the shipped client.
- **SQLAlchemy / Alembic**: only if Epitón someday owns a *non-clinical* local cache DB (explicitly non-authoritative). Prefer IndexedDB / SQLite via Tauri if needed.

## Decision

**Do not introduce** SQLAlchemy, Alembic, Pydantic, NumPy, WeasyPrint, ReportLab, or FastAPI into the Epitón runtime.

**Do keep** Tailwind 4; **gradually** harden `@epiton/ui` with shadcn-style Radix recipes (dialog, dropdown, command already started in web).
