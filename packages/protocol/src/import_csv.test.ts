import { describe, expect, it } from "vitest";
import { parseCsv } from "./import_csv";

describe("import_csv parse", () => {
  it("parses quoted commas and newlines", () => {
    expect(parseCsv('id,name\n1,"Acme, Inc"\n2,Beta')).toEqual([
      ["id", "name"],
      ["1", "Acme, Inc"],
      ["2", "Beta"],
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });
});
