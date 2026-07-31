/**
 * Web Screen facade — re-exports the pure host from `@epiton/view-engine`.
 * Prefer importing from view-engine in shared packages; this module exists for
 * app-local ergonomics and Lote A wiring.
 */
export {
  createRelationQueue,
  createScreen,
  hydrateScreenFromRecord,
  idsFromRelationValue,
  relationQueueHasChanges,
  relationQueueWireValue,
  screenIsDirty,
  screenValuesForSave,
  setScreenRelationQueue,
  updateScreenValues,
  type RelationCommandQueue,
  type RelationFieldKind,
  type ScreenState,
} from "@epiton/view-engine";
