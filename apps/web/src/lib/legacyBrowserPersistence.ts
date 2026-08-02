interface LegacyStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Delete keys produced by older Epiton clients without ever reading their values. */
export function clearLegacyEpitonStorage(storage: LegacyStorage): number {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("epiton.")) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

/** Best-effort cleanup for pre-hardening web and embedded-webview builds. */
export function clearLegacyBrowserPersistence(): boolean {
  if (typeof window === "undefined") return true;
  let cleared = true;
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      clearLegacyEpitonStorage(window[storageName]);
    } catch {
      cleared = false;
    }
  }
  return cleared;
}
