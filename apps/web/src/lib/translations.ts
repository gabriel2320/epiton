import { type EpitonClient, loadTranslationCatalog } from "@epiton/protocol";
import { catalogFromTrytonRows, setCatalog, setLocale } from "@epiton/view-engine";
import i18n from "./i18n";

/** Sync shell i18next + view-engine catalog from preferences / login language. */
export async function applyClientLanguage(
  client: EpitonClient | null,
  lang: string | undefined | null,
): Promise<void> {
  const code = String(lang ?? i18n.language ?? "en").trim() || "en";
  setLocale(code);
  const short = code.slice(0, 2).toLowerCase();
  if (short === "es" || short === "en") {
    void i18n.changeLanguage(short);
  }
  if (!client) {
    setCatalog({});
    return;
  }
  const rows = await loadTranslationCatalog(client, code);
  setCatalog(catalogFromTrytonRows(rows));
}
