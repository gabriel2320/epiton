import { describe, expect, it } from "vitest";
import { csvEscape, rowsToCsv } from "./export_csv";

describe("export_csv", () => {
  it("escapes quotes and commas", () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape(null)).toBe("");
  });

  it("joins rows", () => {
    expect(
      rowsToCsv([
        ["id", "name"],
        [1, "Acme, Inc"],
      ]),
    ).toBe('id,name\n1,"Acme, Inc"');
  });
});
