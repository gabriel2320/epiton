export {
  parseViewLayoutAttributes,
  type ViewLayoutAttributes,
} from "./layout";
export {
  collectFieldNames,
  type FieldType,
  isRelationField,
  type ParsedView,
  parseFieldsViewGet,
  parseXml,
  type SelectionKey,
  type ViewField,
  type ViewNode,
  type ViewType,
} from "./parse";
export {
  type RecordValues,
  type RenderContext,
  renderView,
  type TreeColumn,
  treeButtons,
  treeColumns,
  treeEditable,
  treeEditablePlacement,
  type ViewButtonMeta,
} from "./render";

import { type ParsedView, parseFieldsViewGet } from "./parse";
import type { RecordValues } from "./render";

export {
  labelFieldCandidate,
  numericFieldCandidates,
  type SeriesInsight,
  type SeriesPoint,
  summarizeSeries,
} from "./analytics";
export {
  applyBoardOrder,
  type BoardLayout,
  type BoardTile,
  boardActionNames,
  parseBoardLayout,
} from "./board";
export {
  type CalendarEventRow,
  type CalendarSpec,
  parseCalendarArch,
  rowsToCalendarEvents,
} from "./calendar";
export {
  acceptChildScreenOnChange,
  applyChildScreenOnChange,
  applyChildScreenTrytonOnChange,
  applyRelationQueueOnChange,
  beginChildScreenOnChange,
  type ChildScreenCommitResult,
  type ChildScreenExitDecision,
  type ChildScreenNestedIssues,
  type ChildScreenOnChangeToken,
  type ChildScreenRemovalResult,
  type ChildScreenState,
  type ChildScreenTarget,
  type ChildScreenValidationCode,
  type ChildScreenValidationIssue,
  cancelChildScreen,
  childScreenExitDecision,
  childScreenIsDirty,
  childScreenTargetKey,
  commitChildScreen,
  createChildScreen,
  hydrateChildScreen,
  removeChildScreen,
  setChildScreenRelationQueue,
  updateChildScreenValues,
  validateChildScreen,
  type X2ManyOnChangePatch,
} from "./childScreen";
export {
  formatTrytonDate,
  formatTrytonTime,
  parseTrytonDateInput,
  parseTrytonTimeInput,
  type TrytonDateTimeValue,
  type TrytonDateValue,
  type TrytonTimeValue,
} from "./dates";
export {
  aggregateGraphData,
  GRAPH_ROW_LIMIT,
  type GraphAggregateOp,
  type GraphChartType,
  type GraphSpec,
  inferGraphFields,
  parseGraphArch,
  rowsToGraphData,
  rowsToMultiSeries,
} from "./graph";
export {
  catalogFromTrytonRows,
  getLocale,
  setCatalog,
  setLocale,
  type TranslationDict,
  t,
} from "./i18n";
export {
  createWidgetRegistry,
  type FieldWidget,
  resolveFieldWidget,
  type WidgetRegistry,
  widgetKey,
} from "./plugins";
export {
  evalContext,
  evalDomain,
  evalPyson,
  evalPysonNode,
  type FieldStates,
  type PysonContext,
  type PysonNode,
  resolveStatesAttr,
} from "./pyson";
export {
  hydrateMany2OneRecNames,
  hydrateMany2OneRows,
  isTrytonRelationCommands,
  type O2MCommand,
  type RelationProjectionField,
  relationRecordCount,
  toTrytonM2M,
  toTrytonM2MDelta,
  toTrytonO2M,
  withMany2OneRecNames,
} from "./relations";
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
  relationQueueOnChangeValue,
  relationQueueWireValue,
  relationQueueWithTrytonTimestamps,
  type ScreenState,
  screenForSelection,
  screenIsDirty,
  screenTrytonTimestamps,
  screenValuesForOnChange,
  screenValuesForSave,
  setScreenRelationQueue,
  shouldApplyNewDefaults,
  type TrytonTimestamp,
  type TrytonTimestampMap,
  trytonTimestampsForRecords,
  updateScreenValues,
  withTrytonTimestampContext,
} from "./screen";
export {
  buildSearchDomain,
  DOMAIN_OPERATORS,
  type DomainClause,
  type DomainCombinator,
  type DomainFilter,
  type DomainOperator,
  decodeDomainFilter,
  encodeDomainFilter,
  formatOrder,
  mergeDomains,
  parseDomainValue,
  parseSearchDomain,
  type SearchDomainResult,
  validateTrytonDomain,
} from "./search";
export {
  decodeSelectionKey,
  encodeSelectionKey,
  hydrateRelationSelections,
  normalizeSelectionKey,
  type RelationSelectionLoader,
  type RelationSelectionRequest,
  type RelationSelectionRow,
  relationSelectionRequests,
  selectionValueText,
} from "./selections";
export {
  type FlatTreeRow,
  flattenTreeRows,
  mergeTreeRows,
  sequenceWrites,
  siblingReorderIds,
  type TreeMeta,
  treeMeta,
} from "./tree_hierarchy";

export interface WizardButton {
  state: string;
  string?: string;
  icon?: string;
  default?: boolean;
  validate?: boolean;
}

export interface WizardState {
  sessionId: string;
  state: string;
  view: ParsedView | null;
  values: RecordValues;
  buttons: WizardButton[];
}

/** Normalize wizard/execute payload shapes used by Tryton wizards (Sao-compatible). */
export function parseWizardPayload(payload: Record<string, unknown>): {
  state: string;
  view?: ParsedView;
  defaults?: RecordValues;
  values?: RecordValues;
  buttons: WizardButton[];
  actions: unknown[];
  ended: boolean;
} {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const viewWrapper = payload.view as Record<string, unknown> | undefined;

  if (!viewWrapper || typeof viewWrapper !== "object") {
    return {
      state: String(payload.state ?? payload._state ?? "end"),
      buttons: [],
      actions,
      ended: true,
    };
  }

  const fieldsView =
    (viewWrapper.fields_view as Record<string, unknown> | undefined) ??
    (typeof viewWrapper.arch === "string" ? viewWrapper : undefined);

  let view: ParsedView | undefined;
  if (fieldsView && typeof fieldsView === "object") {
    view = parseFieldsViewGet(fieldsView);
  }

  const buttonsRaw = Array.isArray(viewWrapper.buttons) ? viewWrapper.buttons : [];
  const buttons: WizardButton[] = buttonsRaw
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
    .map((b) => ({
      state: String(b.state ?? "end"),
      string: typeof b.string === "string" ? b.string : undefined,
      icon: typeof b.icon === "string" ? b.icon : undefined,
      default: Boolean(b.default),
      validate: b.validate === undefined ? undefined : Boolean(b.validate),
    }));

  const defaults =
    viewWrapper.defaults && typeof viewWrapper.defaults === "object"
      ? (viewWrapper.defaults as RecordValues)
      : undefined;
  const values =
    viewWrapper.values && typeof viewWrapper.values === "object"
      ? (viewWrapper.values as RecordValues)
      : undefined;

  return {
    state: String(viewWrapper.state ?? payload.state ?? "start"),
    view,
    defaults,
    values,
    buttons,
    actions,
    ended: false,
  };
}
