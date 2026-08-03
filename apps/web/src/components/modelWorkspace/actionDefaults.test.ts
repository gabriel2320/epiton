import { describe, expect, it } from "vitest";
import { actionDomainDefaults, hydrateDefaultMany2OneNames } from "./actionDefaults";

describe("actionDomainDefaults", () => {
  const fields = ["patient", "state", "company", "id"];

  it("extracts simple and nested conjunctive equality constraints", () => {
    expect(
      actionDomainDefaults(
        [
          ["patient", "=", 42],
          ["AND", ["state", "=", "in_progress"], ["company", "=", 7]],
        ],
        fields,
      ),
    ).toEqual({ patient: 42, state: "in_progress", company: 7 });
  });

  it("does not invent defaults from disjunctions, negations or non-equality clauses", () => {
    expect(
      actionDomainDefaults(
        [
          ["OR", ["patient", "=", 42], ["patient", "=", 43]],
          ["NOT", ["state", "=", "done"]],
          ["company", "in", [7, 8]],
        ],
        fields,
      ),
    ).toEqual({});
  });

  it("skips unknown, dotted and id fields", () => {
    expect(
      actionDomainDefaults(
        [
          ["patient.name", "=", "Ada"],
          ["unknown", "=", 9],
          ["id", "=", 5],
          ["patient", "=", 42],
        ],
        fields,
      ),
    ).toEqual({ patient: 42 });
  });

  it("drops a field when conjunctive constraints conflict", () => {
    expect(
      actionDomainDefaults(
        [
          ["patient", "=", 42],
          ["patient", "=", 43],
          ["state", "=", "in_progress"],
        ],
        fields,
      ),
    ).toEqual({ state: "in_progress" });
  });

  it("hydrates scalar Many2One defaults without blocking on a failed label lookup", async () => {
    const resolveRecName = async (relation: string, id: number) => {
      if (relation === "gnuhealth.patient" && id === 42) return "Paciente Epiton";
      throw new Error("unavailable relation");
    };

    await expect(
      hydrateDefaultMany2OneNames(
        { patient: 42, healthprof: 7, state: "in_progress" },
        [
          { name: "patient", type: "many2one", relation: "gnuhealth.patient" },
          {
            name: "healthprof",
            type: "many2one",
            relation: "gnuhealth.healthprofessional",
          },
          { name: "state", type: "selection" },
        ],
        resolveRecName,
      ),
    ).resolves.toEqual({
      patient: [42, "Paciente Epiton"],
      healthprof: 7,
      state: "in_progress",
    });
  });

  it("reuses dotted projections without requesting them again", async () => {
    let requests = 0;
    const values = await hydrateDefaultMany2OneNames(
      {
        patient: 42,
        "patient.": { rec_name: "Paciente proyectado" },
      },
      [{ name: "patient", type: "many2one", relation: "gnuhealth.patient" }],
      async () => {
        requests += 1;
        return "No debe usarse";
      },
    );

    expect(values).toEqual({ patient: [42, "Paciente proyectado"] });
    expect(requests).toBe(0);
  });
});
