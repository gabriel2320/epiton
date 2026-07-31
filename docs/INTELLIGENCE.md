# Epiton intelligence layer

All intelligence runs on-device or in the gateway. Business truth stays in Tryton modules.

## Features

1. **Unified search** — menus, keywords, recent records (`unifiedSearch`).
2. **Next-action suggestions** — frequency of local history (`suggestNextActions`).
3. **Adaptive layout** — cards / list-form / tree-form by viewport + workspace preset.
4. **Board analytics** — embedded panes over Tryton board arch; native DnD layout prefs in `sessionStorage`.
5. **Field assistant** — uses `help` from `fields_view_get` (no silent writes).
6. **Strict ACL coach** — warns when `ir.model.access` rows are missing (Tryton fail-open).
7. **Workspace presets** — general, accounting, warehouse, clinical (GNU Health favorites).
8. **Series insights** — client-side sum/avg/top over `search_read` (never a second SoT).

## Safety

- Never auto-call `write`/`create`/`delete` from suggestions.
- No PHI/PII in telemetry.
- Embeddings (future) stay local; titles/menus only.
