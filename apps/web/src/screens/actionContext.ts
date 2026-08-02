import type { JsonObject, JsonValue } from "@epiton/protocol";
import { evalContext } from "@epiton/view-engine";

/** Compose a resolved Tryton action context against the record that invoked it. */
export function composeActionContext(
  sessionContext: JsonObject,
  resolvedContext: JsonValue | undefined,
  inheritedContext: JsonObject | undefined,
): JsonObject {
  const invocation = inheritedContext ?? {};
  const actionOverlay = evalContext(resolvedContext ?? {}, {
    ...sessionContext,
    ...invocation,
  }) as JsonObject;
  return { ...invocation, ...actionOverlay };
}
