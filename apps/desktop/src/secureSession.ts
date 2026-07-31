/** Desktop beta keeps Tryton tokens in memory; persistence is intentionally disabled. */

export async function saveSessionSecure(session: {
  login: string;
  userId: number;
  session: string;
  baseUrl?: string;
  database?: string;
}): Promise<void> {
  void session;
}

export async function loadSessionSecure(): Promise<{
  login: string;
  userId: number;
  session: string;
  baseUrl?: string;
  database?: string;
} | null> {
  return null;
}

export async function clearSessionSecure(): Promise<void> {
  // No persistent slot is created by hardened builds.
}
