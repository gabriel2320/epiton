# GNU Health / HIS matrix

Epiton targets Tryton RPC compatibility first. GNU Health modules install on trytond and should open through the same view engine.

| Module / model (typical) | Expected view types | Epiton gap | Plugin plan |
|--------------------------|---------------------|------------|-------------|
| `gnuhealth.patient` | form, tree | Validate arch widgets | Patient badge widget |
| `gnuhealth.appointment` | calendar, form | Calendar renderer MVP | Full calendar pack |
| `gnuhealth.prescription.order` | form + O2M lines | O2M lines open | Inline O2M editor |
| `gnuhealth.lab` | form, tree | Binary/report attach | Lab result panel |
| `gnuhealth.hospital.bed` | tree | OK with stock tree | Floor map optional |
| Maternity / neonatology extensions | form notebooks | Notebook/page supported | Specialty presets |
| FHIR bridge (if present) | REST | Use gateway REST proxy | Not in UI v1 |

## Workspace preset

`clinical` preset favorites:

- `gnuhealth.patient`
- `gnuhealth.appointment`
- `party.party`

## Widget plugins

Epiton view-engine exposes a registry (`clinicalWidgetRegistry`) for GH relations:

| Key | Widget |
|-----|--------|
| `relation:gnuhealth.patient` | Patient badge |
| `model:gnuhealth.patient.name` | Patient badge |
| `relation:gnuhealth.appointment` | Appointment chip |

Enable via workspace preset **Clinical (GH)** in the shell (`useClinicalWidgets`).

## Lab bootstrap (no PHI)

Default `docker/` lab ships party/company only — **not** GNU Health.

1. Point Epiton at a Tryton 7.x server that already has `health_*` / `gnuhealth.*` modules installed, **or**
2. Build the optional scaffold image (fill in pinned wheels first):

```bash
# after editing docker/Dockerfile.gnuhealth with real package pins
docker build -f docker/Dockerfile.gnuhealth -t epiton/tryton-gh:7.0 docker/
```

3. Probe models (synthetic admin only):

```bash
pnpm --filter @epiton/protocol build
pnpm gh:check
```

`gh:check` exits `2` when no GH models are present (expected on the stock lab), `0` when at least one opens via `fields_view_get`.

Compose profile sketch (optional override):

```yaml
# docker-compose.gnuhealth.yml (local override — do not commit secrets)
services:
  tryton:
    image: epiton/tryton-gh:7.0
```

## Rules

- No real PHI in fixtures or screenshots.
- Fail-closed clinical writes belong to the HIS (e.g. Epione); Epiton remains a Tryton-compatible client.
- Custom GH widgets register via view-engine plugin registry without forking modules.
