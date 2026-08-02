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
  hydrateSelectedScreen,
  hydrateScreenFromRecord,
  idsFromRelationValue,
  isScreenReadyToSave,
  relationQueueHasChanges,
  relationQueueWithTrytonTimestamps,
  relationQueueWireValue,
  mergeTrytonTimestamps,
  screenIsDirty,
  screenTrytonTimestamps,
  screenForSelection,
  screenValuesForSave,
  setScreenRelationQueue,
  shouldApplyNewDefaults,
  trytonTimestampsForRecords,
  updateScreenValues,
  withTrytonTimestampContext,
  type RelationCommandQueue,
  type RelationFieldKind,
  type ScreenState,
  type TrytonTimestamp,
  type TrytonTimestampMap,
} from "@epiton/view-engine";
