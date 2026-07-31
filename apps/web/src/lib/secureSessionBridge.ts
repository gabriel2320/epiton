/**
 * Persist Tryton session tokens only on native shells (Tauri / Capacitor).
 * Browser web keeps tokens in memory — never localStorage.
 */

import { detectShell } from "./nativeShell";

export type SecureSessionPayload = {
  login: string;
  userId: number;
  session: string;
  baseUrl: string;
  database: string;
};

const CAP_KEY = "epiton.session.v1";

async function dynamicImport(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    // Avoid Vite static analysis of native-only packages in the browser bundle.
    const importer = new Function("s", "return import(s)") as (
      s: string,
    ) => Promise<Record<string, unknown>>;
    return await importer(specifier);
  } catch {
    return null;
  }
}

function isPayload(value: unknown): value is SecureSessionPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.login === "string" &&
    typeof v.userId === "number" &&
    typeof v.session === "string" &&
    typeof v.baseUrl === "string" &&
    typeof v.database === "string"
  );
}

/** Persist session on native shells. Soft-fails on web / missing plugins. */
export async function saveSecureSession(payload: SecureSessionPayload): Promise<boolean> {
  const shell = detectShell();
  if (shell === "web") return false;

  if (shell === "tauri") {
    try {
      const mod = await dynamicImport("@tauri-apps/plugin-store");
      const Store = mod?.Store as
        | {
            load: (file: string) => Promise<{
              set: (k: string, v: unknown) => Promise<void>;
              save: () => Promise<void>;
            }>;
          }
        | undefined;
      if (!Store) return false;
      const store = await Store.load("epiton-session.json");
      await store.set("session", payload);
      await store.save();
      return true;
    } catch {
      return false;
    }
  }

  try {
    const mod = await dynamicImport("@capacitor/preferences");
    const Preferences = mod?.Preferences as
      | { set: (opts: { key: string; value: string }) => Promise<void> }
      | undefined;
    if (!Preferences) return false;
    await Preferences.set({ key: CAP_KEY, value: JSON.stringify(payload) });
    return true;
  } catch {
    return false;
  }
}

/** Load session from native shell store. Soft-fails to null. */
export async function loadSecureSession(): Promise<SecureSessionPayload | null> {
  const shell = detectShell();
  if (shell === "web") return null;

  if (shell === "tauri") {
    try {
      const mod = await dynamicImport("@tauri-apps/plugin-store");
      const Store = mod?.Store as
        | {
            load: (file: string) => Promise<{
              get: <T>(k: string) => Promise<T | undefined>;
            }>;
          }
        | undefined;
      if (!Store) return null;
      const store = await Store.load("epiton-session.json");
      const value = await store.get<unknown>("session");
      return isPayload(value) ? value : null;
    } catch {
      return null;
    }
  }

  try {
    const mod = await dynamicImport("@capacitor/preferences");
    const Preferences = mod?.Preferences as
      | { get: (opts: { key: string }) => Promise<{ value: string | null }> }
      | undefined;
    if (!Preferences) return null;
    const { value } = await Preferences.get({ key: CAP_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Clear native session slot. Soft-fails false. */
export async function clearSecureSession(): Promise<boolean> {
  const shell = detectShell();
  if (shell === "web") return false;

  if (shell === "tauri") {
    try {
      const mod = await dynamicImport("@tauri-apps/plugin-store");
      const Store = mod?.Store as
        | {
            load: (file: string) => Promise<{
              delete: (k: string) => Promise<void>;
              save: () => Promise<void>;
            }>;
          }
        | undefined;
      if (!Store) return false;
      const store = await Store.load("epiton-session.json");
      await store.delete("session");
      await store.save();
      return true;
    } catch {
      return false;
    }
  }

  try {
    const mod = await dynamicImport("@capacitor/preferences");
    const Preferences = mod?.Preferences as
      | { remove: (opts: { key: string }) => Promise<void> }
      | undefined;
    if (!Preferences) return false;
    await Preferences.remove({ key: CAP_KEY });
    return true;
  } catch {
    return false;
  }
}
