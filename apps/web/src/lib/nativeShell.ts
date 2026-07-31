/** Detect native shells wrapping the web UI (Tauri / Capacitor). */

export type ShellKind = "web" | "tauri" | "capacitor";

export function detectShell(): ShellKind {
  if (typeof window === "undefined") return "web";
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) return "tauri";
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return "capacitor";
  return "web";
}

/** Apply `data-shell` on <html> for CSS safe-areas / chrome tweaks. */
export function applyShellDataset(): ShellKind {
  const kind = detectShell();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.shell = kind;
  }
  return kind;
}

/** Keep OS window / tab title in sync with the active workspace. */
export function setShellTitle(parts: Array<string | null | undefined>): void {
  const label = parts.filter(Boolean).join(" · ") || "Epiton";
  if (typeof document !== "undefined") document.title = label;
}
