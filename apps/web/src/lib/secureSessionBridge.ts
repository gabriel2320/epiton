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
      const { clearLegacyTauriSession } = await import("./legacySessionTauri");
      await clearLegacyTauriSession();
      return true;
    } catch {
      return false;
    }
  }

  try {
    const { clearLegacyCapacitorSession } = await import("./legacySessionCapacitor");
    await clearLegacyCapacitorSession(CAP_KEY);
    return true;
  } catch {
    return false;
  }
}
