/** Mobile beta keeps Tryton tokens in memory; persistence is intentionally disabled. */

export async function saveMobileSession(payload: string): Promise<void> {
  void payload;
}

export async function loadMobileSession(): Promise<string | null> {
  return null;
}

export async function clearMobileSession(): Promise<void> {
  // No persistent slot is created by hardened builds.
}
