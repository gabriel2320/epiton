import { describe, expect, it } from "vitest";
import type { ViewField } from "./parse";
import { hydrateMany2OneRecNames, hydrateMany2OneRows, withMany2OneRecNames } from "./relations";
import { createScreen, screenValuesForSave } from "./screen";

const fields: ViewField[] = [
  { name: "party", type: "many2one", relation: "party.party" },
  { name: "name", type: "char" },
  { name: "country", type: "many2one", relation: "country.country" },
];

describe("Tryton Many2One projections", () => {
  it("requests rec_name only for Many2One fields already in the read", () => {
    expect(withMany2OneRecNames(["id", "party", "name", "party.rec_name"], fields)).toEqual([
      "id",
      "party",
      "name",
      "party.rec_name",
    ]);
    expect(withMany2OneRecNames(["id", "party", "name"], fields)).toEqual([
      "id",
      "party",
      "name",
      "party.rec_name",
    ]);
  });

  it("hydrates dotted read values and keeps the wire id on save", () => {
    const values = hydrateMany2OneRecNames(
      {
        id: 4,
        party: 7,
        "party.": { id: 7, rec_name: "Ada Lovelace" },
        name: "P-4",
      },
      fields,
    );

    expect(values).toEqual({ id: 4, party: [7, "Ada Lovelace"], name: "P-4" });
    expect(
      screenValuesForSave(createScreen("gnuhealth.patient", 4, values), {
        party: fields[0]!,
        name: fields[1]!,
      }),
    ).toEqual({ party: 7, name: "P-4" });
  });

  it("removes protocol-only keys while preserving null and malformed relations", () => {
    expect(
      hydrateMany2OneRows(
        [
          { party: null, "party.": null },
          { party: 8, "party.": { rec_name: null } },
          { party: [9, "Existing"] },
        ],
        fields,
      ),
    ).toEqual([{ party: null }, { party: 8 }, { party: [9, "Existing"] }]);
  });
});
