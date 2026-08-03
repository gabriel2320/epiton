import { afterEach, describe, expect, it } from "vitest";
import { setCatalog, setLocale, t } from "./i18n";

afterEach(() => {
  setCatalog({});
  setLocale("en");
});

describe("view-engine translations", () => {
  it("uses the built-in Spanish client chrome for regional locale codes", () => {
    setLocale("es_CL");

    expect(t("epiton.search", "Search")).toBe("Buscar");
    expect(t("epiton.open", "Open")).toBe("Abrir");
    expect(t("epiton.noFile", "No file")).toBe("Sin archivo");
  });

  it("keeps the server catalog authoritative over built-in client text", () => {
    setLocale("es");
    setCatalog({ "epiton.search": "Seleccionar" });

    expect(t("epiton.search", "Search")).toBe("Seleccionar");
  });

  it("uses the supplied fallback for unsupported locales", () => {
    setLocale("de");

    expect(t("epiton.search", "Search")).toBe("Search");
  });
});
