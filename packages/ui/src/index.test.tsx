import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Alert, ConfirmDialog, cn, MetaStrip } from "./index";

describe("@epiton/ui", () => {
  it("joins class names", () => {
    expect(cn("a", false, "b", undefined)).toBe("a b");
  });

  it("renders audit meta when timestamps exist", () => {
    const html = renderToStaticMarkup(
      createElement(MetaStrip, {
        values: {
          create_date: "2026-01-02 03:04:05",
          create_uid: [1, "Admin"],
          write_date: "2026-01-03 04:05:06",
          write_uid: [2, "Clerk"],
        },
      }),
    );
    expect(html).toContain("Created");
    expect(html).toContain("Admin");
    expect(html).toContain("Clerk");
  });

  it("hides meta when empty", () => {
    const html = renderToStaticMarkup(createElement(MetaStrip, { values: {} }));
    expect(html).toBe("");
  });

  it("renders alert tones", () => {
    const html = renderToStaticMarkup(createElement(Alert, { tone: "danger" }, "Delete failed"));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Delete failed");
  });

  it("renders confirm dialog when open", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        open: true,
        title: "Delete records?",
        description: "This cannot be undone.",
        danger: true,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(html).toContain("alertdialog");
    expect(html).toContain("Delete records?");
  });
});
