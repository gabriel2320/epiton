/**
 * Desktop shell uses the web UI via Tauri webview.
 * Session tokens should be persisted with the OS store plugin, not localStorage.
 * The web bundle drives persistence via `apps/web/src/lib/secureSessionBridge.ts`.
 */
import { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "epiton-session.json";

export async function saveSessionSecure(session: {
  login: string;
  userId: number;
  session: string;
  baseUrl?: string;
  database?: string;
}): Promise<void> {
  const store = await Store.load(STORE_FILE);
  await store.set("session", session);
  await store.save();
}

export async function loadSessionSecure(): Promise<{
  login: string;
  userId: number;
  session: string;
  baseUrl?: string;
  database?: string;
} | null> {
  const store = await Store.load(STORE_FILE);
  const value = await store.get<{
    login: string;
    userId: number;
    session: string;
    baseUrl?: string;
    database?: string;
  }>("session");
  return value ?? null;
}

export async function clearSessionSecure(): Promise<void> {
  const store = await Store.load(STORE_FILE);
  await store.delete("session");
  await store.save();
}
