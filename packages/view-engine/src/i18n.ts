export type TranslationDict = Record<string, string>;

/** Minimal i18n helper; server-provided Tryton translations plug in via setCatalog. */
let catalog: TranslationDict = {};
let locale = "en";

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
  return catalog[key] ?? fallback ?? key;
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
