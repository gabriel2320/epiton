import { describe, expect, it } from "vitest";
import { clinicalWidgetRegistry, resolveFieldWidget, widgetKey } from "./index";

describe("widget plugins", () => {
  it("resolves clinical patient relation widget", () => {
    const registry = clinicalWidgetRegistry();
    const widget = resolveFieldWidget(
      registry,
      { name: "patient", type: "many2one", relation: "gnuhealth.patient" },
      "gnuhealth.appointment",
    );
    expect(widget).toBeTypeOf("function");
    expect(registry.has(widgetKey("relation", "gnuhealth.patient"))).toBe(true);
  });
});
