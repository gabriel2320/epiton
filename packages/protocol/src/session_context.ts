/**
 * Load Tryton user preferences and build a PYSON/session context bag.
 * Original Epitón — mirrors Sao get_preferences shape without copying GPL.
 */

import type { EpitonClient, JsonObject, JsonValue } from "./index";

export type SessionPreferences = JsonObject;

/** Fetch res.user.get_preferences(false). Soft-fails to {}. */
export async function loadUserPreferences(client: EpitonClient): Promise<SessionPreferences> {
  try {
    const result = await client.model("res.user", "get_preferences", [false], {});
    if (result && typeof result === "object" && !Array.isArray(result)) {
      return result as SessionPreferences;
    }
  } catch {
    // Preferences optional on minimal labs
  }
  return {};
}

/**
 * Build evaluation / RPC context from preferences + optional action overlay.
 * Includes common Eval targets: company, user, groups, language, employee, etc.
 */
export function buildSessionContext(
  preferences: SessionPreferences,
  overlay: JsonObject = {},
): JsonObject {
  const ctx: JsonObject = { ...preferences };

  // Prefer nested context from preferences when present (Sao reload_context).
  const nested = preferences.context;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    Object.assign(ctx, nested as JsonObject);
  }

  if (preferences.company != null && ctx.company === undefined) {
    ctx.company = preferences.company;
  }
  if (preferences.employee != null && ctx.employee === undefined) {
    ctx.employee = preferences.employee;
  }
  if (preferences.language != null && ctx.language === undefined) {
    ctx.language = preferences.language;
  }
  if (Array.isArray(preferences.groups) && ctx.groups === undefined) {
    ctx.groups = preferences.groups;
  }

  Object.assign(ctx, overlay);
  return ctx;
}

/** Pick view id for a mode from act_window.views tuples. */
export function viewIdForMode(
  views: Array<[number | null, string]> | undefined,
  mode: string,
): number | null {
  if (!views?.length) return null;
  const hit = views.find(([, m]) => m === mode);
  if (hit && hit[0] != null && Number.isFinite(hit[0])) return hit[0];
  return null;
}

/** Coerce unknown preference/context values for RPC. */
export function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

export type { JsonValue };
