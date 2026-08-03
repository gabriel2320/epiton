import { describe, expect, it } from "vitest";
import { noticeTone } from "./workspaceUi";

describe("workspaceUi", () => {
  it("maps notice messages to alert tones", () => {
    expect(noticeTone("Save failed")).toBe("danger");
    expect(noticeTone("Exporting…")).toBe("muted");
    expect(noticeTone("Saved ok")).toBe("accent");
    expect(noticeTone("Guardado")).toBe("accent");
    expect(noticeTone("No se pudo eliminar")).toBe("danger");
    expect(noticeTone("No se pudieron cargar los valores iniciales")).toBe("danger");
    expect(noticeTone("Actualizando campos…")).toBe("muted");
    expect(noticeTone("Ready")).toBe("default");
  });
});
