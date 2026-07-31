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

## Rules

- No real PHI in fixtures or screenshots.
- Fail-closed clinical writes belong to the HIS (e.g. Epione); Epiton remains a Tryton-compatible client.
- Custom GH widgets register via view-engine plugin registry without forking modules.
