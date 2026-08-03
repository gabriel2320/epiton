export type TranslationDict = Record<string, string>;

/** Minimal i18n helper; server-provided Tryton translations plug in via setCatalog. */
let catalog: TranslationDict = {};
let locale = "en";

const builtInCatalogs: Record<string, TranslationDict> = {
  es: {
    "epiton.binaryAttached": "Archivo adjunto",
    "epiton.blockedJavascriptUrl": "javascript: bloqueado",
    "epiton.download": "Descargar",
    "epiton.file": "Archivo",
    "epiton.horizontalSplit": "División horizontal",
    "epiton.noFile": "Sin archivo",
    "epiton.open": "Abrir",
    "epiton.openLines": "Abrir líneas",
    "epiton.records": "registro(s)",
    "epiton.search": "Buscar",
    "epiton.verticalSplit": "División vertical",
  },
};

export function setLocale(next: string): void {
  locale = next;
}

export function getLocale(): string {
  return locale;
}

export function setCatalog(next: TranslationDict): void {
  catalog = next;
}

export function t(key: string, fallback?: string): string {
  const language = locale.trim().toLowerCase().replace("_", "-").split("-")[0] ?? "en";
  return catalog[key] ?? builtInCatalogs[language]?.[key] ?? fallback ?? key;
}

/** Map Tryton ir.translation style rows into a flat catalog. */
export function catalogFromTrytonRows(
  rows: Array<{ src?: string; value?: string; name?: string }>,
): TranslationDict {
  const out: TranslationDict = {};
  for (const row of rows) {
    const key = row.name ?? row.src;
    if (key && row.value) out[key] = row.value;
  }
  return out;
}
