import { describe, expect, it } from "vitest";
import { createWidgetRegistry, resolveFieldWidget, widgetKey } from "./index";

describe("widget plugins", () => {
  it("resolves a caller-provided relation widget without product-specific models", () => {
    const genericWidget = () => "related";
    const registry = createWidgetRegistry([
      [widgetKey("relation", "example.related"), genericWidget],
    ]);
    const widget = resolveFieldWidget(
      registry,
      { name: "related", type: "many2one", relation: "example.related" },
      "example.record",
    );
    expect(widget).toBe(genericWidget);
    expect(registry.has(widgetKey("relation", "example.related"))).toBe(true);
  });
});
