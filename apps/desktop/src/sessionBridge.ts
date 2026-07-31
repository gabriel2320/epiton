/**
 * Bridge Tauri secure storage into the web session store when running in desktop.
 */
import type { TrytonSession } from "@epiton/protocol";

export async function hydrateDesktopSession(
  setSession: (s: { login: string; userId: number } | null) => void,
  applyToken: (session: TrytonSession) => void,
): Promise<boolean> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return false;
  }
  try {
    const mod = await import("./secureSession");
    const saved = await mod.loadSessionSecure();
    if (!saved) return false;
    setSession({ login: saved.login, userId: saved.userId });
    applyToken(saved);
    return true;
  } catch {
    return false;
  }
}

export async function persistDesktopSession(session: TrytonSession): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const mod = await import("./secureSession");
    await mod.saveSessionSecure(session);
  } catch {
    // web fallback: ignore
  }
}
