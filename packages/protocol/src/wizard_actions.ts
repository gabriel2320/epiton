/**
 * Normalize wizard.execute returned actions into openable refs.
 * Typical Tryton shapes: [action_id, data], [{type, id, ...}, data], "model.name".
 */

export function wizardActionRefs(actions: unknown[]): string[] {
  const refs: string[] = [];
  for (const item of actions) {
    const ref = oneWizardActionRef(item);
    if (ref) refs.push(ref);
  }
  return refs;
}

function oneWizardActionRef(item: unknown): string | null {
  if (typeof item === "string" && item.includes(".")) return item;
  if (typeof item === "number" && Number.isFinite(item)) {
    return `ir.action.act_window,${item}`;
  }
  if (!Array.isArray(item)) {
    if (item && typeof item === "object") {
      return actionDictRef(item as Record<string, unknown>);
    }
    return null;
  }
  // [action, data] or [action_id, data]
  const head = item[0];
  if (typeof head === "number") return `ir.action.act_window,${head}`;
  if (typeof head === "string" && head.includes(".")) return head;
  if (head && typeof head === "object") {
    return actionDictRef(head as Record<string, unknown>);
  }
  return null;
}

function actionDictRef(action: Record<string, unknown>): string | null {
  const type = typeof action.type === "string" ? action.type : null;
  const id = Number(action.id);
  if (type && Number.isFinite(id)) return `${type},${id}`;
  if (typeof action.res_model === "string") return action.res_model;
  if (typeof action.wiz_name === "string") return action.wiz_name;
  if (typeof action.report_name === "string") return action.report_name;
  return null;
}
