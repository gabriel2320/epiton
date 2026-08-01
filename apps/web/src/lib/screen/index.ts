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
  relationQueueWireValue,
  screenIsDirty,
  screenForSelection,
  screenValuesForSave,
  setScreenRelationQueue,
  shouldApplyNewDefaults,
  updateScreenValues,
  type RelationCommandQueue,
  type RelationFieldKind,
  type ScreenState,
} from "@epiton/view-engine";
