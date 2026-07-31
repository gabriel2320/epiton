import { describe, expect, it, vi } from "vitest";
import { applyFieldChange, buildOnChangeArgs } from "./onchange";

describe("onchange", () => {
  it("buildOnChangeArgs flattens many2one", () => {
    expect(
      buildOnChangeArgs({ id: 3, party: [9, "Acme"], name: "x" }, ["id", "party", "name"]),
    ).toEqual({ id: 3, party: 9, name: "x" });
  });

  it("applyFieldChange runs on_change then on_change_with", async () => {
    const client = {
      model: vi.fn(async (_m: string, method: string) => {
        if (method === "on_change_party") return { name: "from-on-change" };
        if (method === "on_change_with_code") return { code: "C1" };
        return {};
      }),
    };
    const patch = await applyFieldChange(
      client,
      "sale.sale",
      {
        party: { name: "party", on_change: ["party"] },
        code: { name: "code", on_change_with: ["party"] },
      },
      { id: 1, party: [2, "P"] },
      "party",
    );
    expect(patch.name).toBe("from-on-change");
    expect(patch.code).toBe("C1");
  });
});
