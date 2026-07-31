export {
  collectFieldNames,
  isRelationField,
  parseFieldsViewGet,
  parseXml,
  type FieldType,
  type ParsedView,
  type ViewField,
  type ViewNode,
  type ViewType,
} from "./parse";
export {
  renderView,
  treeColumns,
  type RecordValues,
  type RenderContext,
  type TreeColumn,
} from "./render";
import { type ParsedView, parseFieldsViewGet } from "./parse";
import type { RecordValues } from "./render";
export {
  catalogFromTrytonRows,
  getLocale,
  setCatalog,
  setLocale,
  t,
  type TranslationDict,
} from "./i18n";
export {
  toTrytonM2M,
  toTrytonO2M,
  type O2MCommand,
} from "./relations";
export {
  createWidgetRegistry,
  resolveFieldWidget,
  widgetKey,
  type FieldWidget,
  type WidgetRegistry,
} from "./plugins";
export {
  appointmentChipWidget,
  clinicalWidgetRegistry,
  patientBadgeWidget,
} from "./clinical_widgets";
export {
  rowsToCalendarEvents,
  type CalendarEventRow,
} from "./calendar";
export { GRAPH_ROW_LIMIT, inferGraphFields, rowsToGraphData } from "./graph";
export {
  buildSearchDomain,
  formatOrder,
  mergeDomains,
} from "./search";
export {
  evalContext,
  evalDomain,
  evalPyson,
  evalPysonNode,
  resolveStatesAttr,
  type FieldStates,
  type PysonContext,
  type PysonNode,
} from "./pyson";
export { formatTrytonDate, parseTrytonDateInput } from "./dates";
export { boardActionNames } from "./board";

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
