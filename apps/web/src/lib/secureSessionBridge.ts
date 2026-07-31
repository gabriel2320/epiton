/**
 * Session tokens are memory-only on every shell.
 *
 * The former native implementation used Tauri Store / Capacitor Preferences,
 * which are preference stores rather than secret stores. `clearSecureSession`
 * remains temporarily to erase those legacy slots during migration.
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

/** Deliberately refuses persistent token storage until a secret-store provider is wired. */
export async function saveSecureSession(_payload: SecureSessionPayload): Promise<boolean> {
  return false;
}

/** Deliberately refuses to hydrate tokens from legacy preference stores. */
export async function loadSecureSession(): Promise<SecureSessionPayload | null> {
  return null;
}

/** Clear native legacy preference slots. Soft-fails false. */
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
