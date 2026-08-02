import type { JsonObject } from "@epiton/protocol";
export type { WorkspaceListViewMode } from "./workspaceNavigation";

export interface ListActionAvailabilityInput {
  clientAvailable: boolean;
  hasFocusedRecord: boolean;
  multiSelectedCount: number;
  visibleRowCount: number;
}

export interface RecordActionAvailabilityInput {
  mode: "read" | "write";
  clientAvailable: boolean;
  hasFocusedRecord: boolean;
  canSave: boolean;
  savePending: boolean;
}

/** Pure availability contract shared by the generic list action toolbar. */
export function listActionAvailability(input: ListActionAvailabilityInput) {
  const hasSelection = input.multiSelectedCount > 0 || input.hasFocusedRecord;
  return {
    deleteDisabled: !hasSelection,
    copyDisabled: !input.clientAvailable || !hasSelection,
    exportDisabled: !input.clientAvailable || (!hasSelection && input.visibleRowCount === 0),
    importDisabled: !input.clientAvailable,
  };
}

/** Pure availability contract shared by the selected-record action toolbar. */
export function recordActionAvailability(input: RecordActionAvailabilityInput) {
  return {
    modeDisabled:
      input.savePending || (input.mode === "read" && (!input.clientAvailable || !input.canSave)),
    saveDisabled: input.savePending || !input.canSave,
    deleteDisabled: !input.hasFocusedRecord,
    copyDisabled: !input.clientAvailable || !input.hasFocusedRecord,
    historyDisabled: !input.hasFocusedRecord,
    emailDisabled: !input.hasFocusedRecord,
  };
}

/** Match Tryton action references before falling back to a model button RPC. */
export function isActionButton(name: string, type?: string): boolean {
  const normalizedType = (type ?? "").toLowerCase();
  return (
    normalizedType === "action" ||
    /^(ir\.action\.|act_|wizard\.|report\.)/i.test(name) ||
    /^[\w.-]+,[\d]+$/.test(name)
  );
}

/** Overlay the canonical Tryton active-record context without changing the base context. */
export function buttonRpcContext(
  context: JsonObject,
  model: string,
  ids: [number, ...number[]],
): JsonObject {
  return {
    ...context,
    active_id: ids[0],
    active_ids: ids,
    active_model: model,
  };
}
