import { type ReactNode, createElement } from "react";
import type { ViewField } from "./parse";
import { type FieldWidget, createWidgetRegistry, widgetKey } from "./plugins";

/** Clinical / GNU Health oriented widgets (synthetic UI only; no PHI). */
export function patientBadgeWidget(field: ViewField, value: unknown): ReactNode {
  const label = Array.isArray(value) ? String(value[1] ?? value[0] ?? "") : String(value ?? "");
  return createElement(
    "div",
    {
      className: "epiton-patient-badge",
      style: {
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        padding: "0.35rem 0.55rem",
        borderRadius: "999px",
        border: "1px solid var(--epiton-border)",
        background: "color-mix(in oklab, var(--epiton-accent) 12%, transparent)",
      },
    },
    createElement("span", { "aria-hidden": true }, "◉"),
    createElement("strong", null, label || field.string || field.name),
  );
}

export function appointmentChipWidget(field: ViewField, value: unknown): ReactNode {
  return createElement(
    "div",
    { className: "epiton-appointment-chip" },
    createElement("span", null, field.string ?? field.name),
    createElement("code", null, String(value ?? "—")),
  );
}

export function clinicalWidgetRegistry() {
  const widgets: Array<[string, FieldWidget]> = [
    [widgetKey("relation", "gnuhealth.patient"), patientBadgeWidget],
    [widgetKey("model", "gnuhealth.patient.name"), patientBadgeWidget],
    [widgetKey("relation", "gnuhealth.appointment"), appointmentChipWidget],
  ];
  return createWidgetRegistry(widgets);
}
