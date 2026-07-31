import type { EpitonClient, JsonObject, JsonValue } from "./index";

export interface WizardSession {
  name: string;
  sessionId: string;
  startState: string;
  endState: string;
}

export interface WizardExecuteResult {
  raw: JsonObject;
  actions: JsonValue[];
}

/** Create a Tryton wizard session (`wizard.<name>.create`). */
export async function wizardCreate(
  client: EpitonClient,
  name: string,
  context: JsonObject = {},
): Promise<WizardSession> {
  const created = await client.call(`wizard.${name}.create`, [context]);
  if (!Array.isArray(created) || created.length < 1) {
    throw new Error(`wizard.${name}.create returned unexpected payload`);
  }
  return {
    name,
    sessionId: String(created[0]),
    startState: typeof created[1] === "string" ? created[1] : "start",
    endState: typeof created[2] === "string" ? created[2] : "end",
  };
}

/**
 * Execute a wizard state.
 * `data` must be keyed by StateView name: `{ start: { field: value } }`.
 */
export async function wizardExecute(
  client: EpitonClient,
  session: Pick<WizardSession, "name" | "sessionId">,
  data: JsonObject,
  stateName: string,
  context: JsonObject = {},
): Promise<WizardExecuteResult> {
  const result = await client.call(`wizard.${session.name}.execute`, [
    session.sessionId,
    data,
    stateName,
    context,
  ]);
  const raw =
    result && typeof result === "object" && !Array.isArray(result) ? (result as JsonObject) : {};
  const actions = Array.isArray(raw.actions) ? (raw.actions as JsonValue[]) : [];
  return { raw, actions };
}

export async function wizardDelete(
  client: EpitonClient,
  session: Pick<WizardSession, "name" | "sessionId">,
  context: JsonObject = {},
): Promise<JsonValue> {
  return client.call(`wizard.${session.name}.delete`, [session.sessionId, context]);
}

/** Build Sao-compatible execute data from the active view state values. */
export function wizardDataForState(stateName: string, values: JsonObject): JsonObject {
  return { [stateName]: values };
}
