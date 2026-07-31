# Epiton intelligence layer

All intelligence runs on-device or in the gateway. Business truth stays in Tryton modules.

## Features

1. **Unified search** — menus, keywords, recent records (`unifiedSearch`).
2. **Next-action suggestions** — frequency of local history (`suggestNextActions`).
3. **Adaptive layout** — cards / list-form / tree-form by viewport + workspace preset.
4. **Field assistant** — uses `help` from `fields_view_get` (no silent writes).
5. **Strict ACL coach** — warns when `ir.model.access` rows are missing (Tryton fail-open).
6. **Workspace presets** — general, accounting, warehouse, clinical (GNU Health favorites).

## Safety

- Never auto-call `write`/`create`/`delete` from suggestions.
- No PHI/PII in telemetry.
- Embeddings (future) stay local; titles/menus only.
