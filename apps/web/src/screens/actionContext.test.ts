import { describe, expect, it } from "vitest";
import { composeActionContext } from "./actionContext";

describe("composeActionContext", () => {
  it("preserves active record context and evaluates the action overlay against it", () => {
    expect(
      composeActionContext(
        { language: "es", company: 3 },
        {
          default_patient: { __class__: "Eval", v: "active_id", d: null },
          company: { __class__: "Eval", v: "company", d: null },
        },
        { active_model: "gnuhealth.patient", active_id: 42, active_ids: [42] },
      ),
    ).toEqual({
      active_model: "gnuhealth.patient",
      active_id: 42,
      active_ids: [42],
      default_patient: 42,
      company: 3,
    });
  });

  it("lets explicit action values override inherited invocation values", () => {
    expect(
      composeActionContext(
        { language: "es" },
        { active_id: 9, marker: "action" },
        { active_id: 7, active_ids: [7], marker: "caller" },
      ),
    ).toEqual({ active_id: 9, active_ids: [7], marker: "action" });
  });
});
