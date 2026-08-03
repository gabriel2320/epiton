import { describe, expect, it } from "vitest";
import { parseFieldsViewGet } from "./parse";
import {
  decodeSelectionKey,
  encodeSelectionKey,
  hydrateRelationSelections,
  relationSelectionRequests,
  selectionValueText,
} from "./selections";

function preferencesView() {
  return parseFieldsViewGet({
    arch: '<form><field name="company" widget="selection"/></form>',
    fields: {
      company: {
        type: "many2one",
        relation: "company.company",
        domain: [["id", "in", { __class__: "Eval", v: "companies", d: [] }]],
        context: { selected_company: { __class__: "Eval", v: "company", d: null } },
      },
    },
  });
}

describe("relation-backed selections", () => {
  it("keeps numeric and textual keys distinct across DOM and domain encodings", () => {
    const options: Array<[number | string, string]> = [
      [1, "Numeric"],
      ["1", "Text"],
    ];

    expect(encodeSelectionKey(1)).not.toBe(encodeSelectionKey("1"));
    expect(encodeSelectionKey("u")).toBe("u");
    expect(encodeSelectionKey("number:1")).toBe("string:number:1");
    expect(encodeSelectionKey("")).toBe("string:");
    expect(decodeSelectionKey(options, encodeSelectionKey(1))).toBe(1);
    expect(decodeSelectionKey(options, encodeSelectionKey("1"))).toBe("1");
    expect(selectionValueText(1)).toBe("1");
    expect(selectionValueText("1")).toBe('"1"');
  });

  it("builds Tryton search requests from evaluated field domain and context", () => {
    const requests = relationSelectionRequests(preferencesView(), {
      company: 1,
      companies: [1, 2],
    });

    expect(requests).toEqual([
      {
        fieldName: "company",
        relation: "company.company",
        domain: [["id", "in", [1, 2]]],
        context: { selected_company: 1 },
        currentValue: 1,
      },
    ]);
  });

  it("hydrates numeric ids, a null choice, and the current inactive tuple immutably", async () => {
    const view = preferencesView();
    const hydrated = await hydrateRelationSelections(
      view,
      { company: [3, "Hospital histórico"], companies: [1, 2] },
      async (request) => {
        expect(request.relation).toBe("company.company");
        return [
          { id: 1, rec_name: "Hospital Norte" },
          { id: 2, rec_name: "Hospital Sur" },
        ];
      },
    );

    expect(hydrated).not.toBe(view);
    expect(view.fields.company?.selection).toBeUndefined();
    expect(hydrated.fields.company?.selection).toEqual([
      [1, "Hospital Norte"],
      [2, "Hospital Sur"],
      [3, "Hospital histórico"],
      [null, ""],
    ]);
  });
});
