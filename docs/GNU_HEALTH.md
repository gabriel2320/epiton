# GNU Health compatibility contract

Epitón supports GNU Health through the same dynamic Tryton contract used for
every module: menus, actions, `fields_view_get`, PYSON, relations, wizards,
reports, and Session RPC. It does not maintain a parallel clinical API, schema,
workspace preset, or list of hard-coded patient/appointment widgets.

This keeps the client compatible with the GNU Health version and modules that
the connected trytond instance actually exposes. It also avoids treating model
names as proof that a clinical workflow is correct.

## Current evidence

| Boundary | Status | Meaning |
|----------|--------|---------|
| Generic Tryton 7/8 protocol | Verified | Core metadata, CRUD, actions, keywords, attachments |
| Generic browser CRUD | Verified | Browser → gateway → trytond → browser on both tiers |
| GNU Health namespace discovery | Implemented | Reads `ir.model` metadata for `gnuhealth.*` only |
| Dedicated GNU Health lab | Not yet verified | No module- or workflow-level compatibility claim |
| PHI / clinical production readiness | **Not claimed** | Requires separate security, clinical, and operational governance |

The stock Docker lab contains party/company modules only. Therefore
`pnpm gh:check` exits `2` there by design. Exit `0` means at least one
`gnuhealth.*` model was discovered and its tree/form view capability was
probed; it does **not** certify that model's workflow.

## Metadata-only discovery

Run against a synthetic, dedicated GNU Health environment:

```bash
pnpm --filter @epiton/protocol build
EPITON_GH_ENVIRONMENT_KIND=synthetic-gnu-health pnpm gh:check
```

Connection variables follow the other lab scripts:
`EPITON_BASE`, `EPITON_DB`, `EPITON_USER`, and `EPITON_PASSWORD`. They are used
in memory and are deliberately excluded from the receipt.

The default receipt is
`tests/compat/receipts/gnu-health-latest.json` (gitignored, mode `0600`) with
schema `epiton.gnu-health-discovery.v1`. It contains only:

- an operator-supplied environment kind;
- technical `gnuhealth.*` model names;
- whether tree/form metadata could be obtained;
- explicit flags confirming no business-row reads, writes, or PHI.

Upstream error details are redacted. The probe never searches, reads, creates,
writes, deletes, or exports GNU Health business records.

## Dedicated lab requirements

`docker/Dockerfile.gnuhealth` is an intentionally non-functional scaffold,
because GNU Health packages must be pinned to a compatible Tryton series. A
future supported lab must:

1. pin every GNU Health and Tryton package exactly;
2. use a disposable database and synthetic fixtures only;
3. route the browser through the Epitón gateway;
4. run metadata discovery before model-specific browser scenarios;
5. clean up all synthetic writes and publish only redacted receipts;
6. add evidence to `COMPATIBILITY.md` before changing any support claim.

Prefer composing against a maintained GNU Health trytond image over adding
GNU Health or Proteus to the Epitón runtime. Proteus remains an isolated lab
oracle; it is not shipped in the UI, gateway, or production images.

## Rules

- No real PHI/PII in fixtures, screenshots, logs, receipts, or agent context.
- No clinical model names in runtime presets or special-case render paths.
- Server views, domains, states, ACLs, wizards, and reports remain authoritative.
- Optional industry widgets must be supplied by a separate, versioned plugin
  and cannot be used as compatibility evidence by themselves.
- Epitón is a Tryton client, not a clinical system of record.
