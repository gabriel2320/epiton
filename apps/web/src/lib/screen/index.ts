/**
 * Web Screen facade — re-exports the pure host from `@epiton/view-engine`.
 * Prefer importing from view-engine in shared packages; this module exists for
 * app-local ergonomics and Lote A wiring.
 */
export {
  acceptAsyncScreenUpdate,
  acceptLatestAsyncScreenUpdate,
  createRelationQueue,
  createScreen,
  hydrateScreenFromRecord,
  hydrateSelectedScreen,
  idsFromRelationValue,
  isScreenReadyToSave,
  mergeTrytonTimestamps,
  type RelationCommandQueue,
  type RelationFieldKind,
  relationQueueHasChanges,
  relationQueueWireValue,
  relationQueueWithTrytonTimestamps,
  type ScreenState,
  screenForSelection,
  screenIsDirty,
  screenTrytonTimestamps,
  screenValuesForSave,
  setScreenRelationQueue,
  shouldApplyNewDefaults,
  type TrytonTimestamp,
  type TrytonTimestampMap,
  trytonTimestampsForRecords,
  updateScreenValues,
  withTrytonTimestampContext,
} from "@epiton/view-engine";
