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

export interface WizardState {
  sessionId: string;
  state: string;
  view: ParsedView | null;
  values: RecordValues;
}

/** Normalize wizard/execute payload shapes used by Tryton wizards. */
export function parseWizardPayload(payload: Record<string, unknown>): {
  state: string;
  view?: ParsedView;
  defaults?: RecordValues;
} {
  const state = String(payload.state ?? payload._state ?? "start");
  const viewPayload = payload.view as Record<string, unknown> | undefined;
  let view: ParsedView | undefined;
  if (viewPayload && typeof viewPayload.arch === "string") {
    view = parseFieldsViewGet(viewPayload);
  }
  const defaults =
    payload.defaults && typeof payload.defaults === "object"
      ? (payload.defaults as RecordValues)
      : undefined;
  return { state, view, defaults };
}
