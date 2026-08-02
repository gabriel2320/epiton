import type { JsonObject } from "@epiton/protocol";
export type { WorkspaceListViewMode } from "./workspaceNavigation";

export interface ListActionAvailabilityInput {
  clientAvailable: boolean;
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  hasFocusedRecord: boolean;
  multiSelectedCount: number;
  visibleRowCount: number;
}

export interface RecordActionAvailabilityInput {
  mode: "read" | "write";
  clientAvailable: boolean;
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  hasFocusedRecord: boolean;
  canSave: boolean;
  savePending: boolean;
}

/** Pure availability contract shared by the generic list action toolbar. */
export function listActionAvailability(input: ListActionAvailabilityInput) {
  const hasSelection = input.multiSelectedCount > 0 || input.hasFocusedRecord;
  return {
    newDisabled: !input.clientAvailable || !input.canCreate,
    inlineEditDisabled: !input.clientAvailable || !input.canWrite,
    deleteDisabled: !input.clientAvailable || !input.canDelete || !hasSelection,
    copyDisabled: !input.clientAvailable || !input.canCreate || !hasSelection,
    exportDisabled: !input.clientAvailable || (!hasSelection && input.visibleRowCount === 0),
    importDisabled: !input.clientAvailable || !input.canCreate,
  };
}

/** Pure availability contract shared by the selected-record action toolbar. */
export function recordActionAvailability(input: RecordActionAvailabilityInput) {
  const canModify = input.hasFocusedRecord ? input.canWrite : input.canCreate;
  return {
    modeDisabled:
      input.savePending ||
      !input.clientAvailable ||
      !canModify ||
      (input.mode === "read" && !input.canSave),
    saveDisabled: input.savePending || !canModify || !input.canSave,
    deleteDisabled: !input.clientAvailable || !input.canDelete || !input.hasFocusedRecord,
    copyDisabled: !input.clientAvailable || !input.canCreate || !input.hasFocusedRecord,
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
