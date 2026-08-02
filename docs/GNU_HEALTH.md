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
| Chilean `health` core RPC profile | Verified | Pinned Tryton 8/PostgreSQL synthetic lab; Spanish session, exact activated modules and five critical view contracts |
| GNU Health core browser rendering | Verified | Spanish menus, four empty clinical workspaces, and an unsaved patient form through gateway → trytond |
| Clinical CRUD and workflows | Not yet verified | Navigation/render evidence performs no writes and is not a workflow certification |
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

For the pinned Chilean core, add
`EPITON_GH_PROFILE=health-core-cl`. That stricter profile fails unless the
authenticated preference is Spanish, the activated module set is exactly
`health` plus its seven Tryton dependencies, the translated root menus are
present, and the patient, appointment, evaluation and prescription views expose
their required metadata. It remains read-only and synthetic.

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
- for the optional Chilean core profile, language/module/menu evidence and
  technical required-view field counts.

Upstream error details are redacted. The probe never searches, reads, creates,
writes, deletes, or exports GNU Health business records.

## Browser gate

The GPL backend source tree can opt into the Epitón browser boundary after its
clean PostgreSQL validation:

```bash
EPITON_TEST_CLIENT_GATE=1 ./scripts/test_health_postgresql.sh
```

The gate starts a temporary trytond HTTP listener and the Epitón gateway, then
runs `e2e/gnu-health-core.spec.ts` against an isolated web port. It proves that
the authenticated Spanish menu can open patient, appointment, prescription,
and evaluation workspaces and render a new-patient form from live Tryton view
metadata. It also rejects page/console errors, duplicate IDs, inaccessible form
controls, layout overlaps, and narrow relation inputs, and records a synthetic
screenshot.

This scenario deliberately leaves the form unsaved. It is a client rendering
gate, not evidence for patient CRUD, clinical workflows, ACL correctness,
auditing, PHI handling, or production readiness.

## Deployment transport controls

The production web host pins traffic to its own origin or to a same-origin path
configured with `VITE_EPITON_GATEWAY_URL` (Vite) or
`NEXT_PUBLIC_EPITON_GATEWAY_URL` (Next). Deployments can select `auto`, `rpc`, or
`bare` through `VITE_EPITON_RPC_SUFFIX` or `NEXT_PUBLIC_EPITON_RPC_SUFFIX`. Bus polling is
disabled unless the deployment sets `VITE_EPITON_BUS_ENABLED=true` or
`NEXT_PUBLIC_EPITON_BUS_ENABLED=true` and its proxy exposes the Tryton bus
route. These are transport capabilities only; none changes server-side GNU
Health authority or persists session state.

## Dedicated lab requirements

`docker/Dockerfile.gnuhealth` remains an intentionally non-functional scaffold.
The verified Chilean core is assembled in the separate GPL GNU Health source
tree with exact Python/Tryton locks and a disposable PostgreSQL cluster; GNU
Health code is not copied into this Apache-2.0 client. A fully supported browser
lab must still:

1. retain the exact GNU Health and Tryton package pins;
2. use a disposable database and synthetic fixtures only;
3. route the browser through the Epitón gateway;
4. run the verified core profile before model-specific browser scenarios;
5. pass the browser rendering gate;
6. clean up all synthetic writes and publish only redacted receipts;
7. add evidence to `COMPATIBILITY.md` before changing any support claim.

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
