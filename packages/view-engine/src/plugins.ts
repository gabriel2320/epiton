import type { ReactNode } from "react";
import type { ViewField } from "./parse";

export type FieldWidget = (field: ViewField, value: unknown) => ReactNode;

export type WidgetRegistry = Map<string, FieldWidget>;

/** Registry key helpers: `model:field` or `relation:model` or `type:fieldType`. */
export function widgetKey(kind: "model" | "relation" | "type", name: string): string {
  return `${kind}:${name}`;
}

export function createWidgetRegistry(seed: Array<[string, FieldWidget]> = []): WidgetRegistry {
  return new Map(seed);
}

export function resolveFieldWidget(
  registry: WidgetRegistry | undefined,
  field: ViewField,
  model?: string,
): FieldWidget | undefined {
  if (!registry) return undefined;
  if (model) {
    const byModel = registry.get(widgetKey("model", `${model}.${field.name}`));
    if (byModel) return byModel;
  }
  if (field.relation) {
    const byRel = registry.get(widgetKey("relation", field.relation));
    if (byRel) return byRel;
  }
  return registry.get(widgetKey("type", field.type));
}
