# Epitón tooling evaluation

Epitón is a **Tryton-compatible client**. Clinical/business truth stays on
**trytond** (JSON-RPC Session). The gateway is **Axum (Rust)**; the UI is
**Next.js + React + TypeScript**. New libraries must not create a second source
of truth or a parallel Python stack beside trytond.

Canon: [`CANON.md`](CANON.md) · Governance: [`GOVERNANCE.md`](GOVERNANCE.md) ·
Agents: [`../AGENTS.md`](../AGENTS.md).

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
| **Next.js 16** | Web application host | **Adopt progressively** | App Router is the target host; the Tryton runtime stays a client island while server layout/document concerns remain server-first. |
| **Vite 6** | Embedded native assets + existing web bridge | **Keep narrowly** | Next CSP/PWA/E2E now pass. After N2, remove the Vite web entrypoint but retain its minimal static adapter while Tauri/Capacitor embed local assets. It must not contain a parallel UI or Tryton behavior. |
| **Tailwind** | Utility CSS | **Keep (already)** | Tailwind CSS **4** uses the host adapter (`@tailwindcss/postcss` for Next, `@tailwindcss/vite` during the bridge). |
| **shadcn/ui** | Component recipes | **Adopt selectively** | `@epiton/ui` ships Input/Badge/Tabs/Separator/MetaStrip/Alert/ConfirmDialog. Prefer recipes over CLI dump. |

## What to use instead

| Need | Epitón choice |
|------|----------------|
| HTTP gateway / CSP / session proxy | `apps/gateway` (Axum) |
| Web host and document composition | Next.js App Router; no backend ids or client state in routes |
| Form/DTO validation | Zod + react-hook-form |
| UI primitives | `@epiton/ui` (+ Radix where interaction needs it) |
| Styling | Tailwind 4 + CSS variables in `app.css` |
| Tables / virtualization | TanStack Table + Virtual |
| Charts | Recharts (≤500 rows; vbar/hbar/line/pie + board analytics) |
| PDF preview | pdfjs-dist over Tryton report binaries |
| Search | fuse.js + intelligence package |
| Dashboard layout | Native HTML5 drag-and-drop (no DnD library) |
| Server-state projection | TanStack Query in process memory; no persistence adapter |

The progressive host gates are `pnpm check:next` for the App Router build,
`pnpm test:e2e:next` for its production browser/CSP/static-PWA contract, and
`pnpm --filter @epiton/web build` for the current Vite web/native-static
artifact. All must stay green during N1 so the migration cannot silently fork
the product. The Next E2E gate qualifies the installable web PWA but does not
replace native-shell receipts: CI now builds an Android debug APK and Linux
Tauri DEB/AppImage bundles, with their first green Actions receipts still
required. Next request-time nonce/Proxy behavior remains server-hosted rather
than being weakened into a static export.

## Optional future (non-core) niches

These are **not** default dependencies; only consider behind a clear consumer:

- **FastAPI / Pydantic**: research-only sidecar (benchmarks, offline tools), never on the clinical write path.
- **WeasyPrint / ReportLab**: only if a future *offline export lab* must render PDFs without trytond — still not for production HIS writes.
- **NumPy**: only in a research notebook/worker outside the shipped client.
- **Client databases**: IndexedDB/SQLite and ORM/migration layers are rejected by
  the current canon. Adding one requires an explicit authority and threat-model
  change; trytond must remain the only truth.

## Decision

**Do not introduce** SQLAlchemy, Alembic, Pydantic, NumPy, WeasyPrint, ReportLab, or FastAPI into the Epitón runtime.

**Do keep** Tailwind 4; **gradually** harden `@epiton/ui` with shadcn-style Radix recipes (dialog, dropdown, command already started in web).
