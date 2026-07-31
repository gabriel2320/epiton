/**
 * Persist Tryton user preferences (Sao set_preferences shape).
 */

import type { EpitonClient, JsonObject } from "./index";
import {
  type SessionPreferences,
  buildSessionContext,
  loadUserPreferences,
} from "./session_context";

/** Call res.user.set_preferences(values). Soft-fails false. */
export async function saveUserPreferences(
  client: EpitonClient,
  values: JsonObject,
): Promise<boolean> {
  try {
    await client.model("res.user", "set_preferences", [values], {});
    return true;
  } catch {
    return false;
  }
}

/** Save prefs then reload get_preferences + session context. */
export async function reloadSessionPreferences(
  client: EpitonClient,
  userId: number,
  patch: JsonObject = {},
): Promise<{ preferences: SessionPreferences; sessionContext: JsonObject }> {
  if (Object.keys(patch).length) {
    await saveUserPreferences(client, patch);
  }
  const preferences = await loadUserPreferences(client);
  return {
    preferences,
    sessionContext: buildSessionContext(preferences, { user: userId }),
  };
}
