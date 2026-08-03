import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "./onchange";
import { applyFieldChange, buildOnChangeArgs, preValidateRecord } from "./onchange";

describe("onchange", () => {
  it("buildOnChangeArgs flattens many2one", () => {
    expect(
      buildOnChangeArgs({ id: 3, party: [9, "Acme"], name: "x" }, ["id", "party", "name"], {
        party: { name: "party", type: "many2one" },
      }),
    ).toEqual({ id: 3, party: 9, name: "x" });
  });

  it("preserves x2many and multiselection arrays", () => {
    const values = {
      lines: [
        { id: 4, quantity: 2 },
        { id: -1, quantity: 1 },
      ],
      tags: [3, 8],
      channels: ["email", "phone"],
    };
    expect(
      buildOnChangeArgs(values, Object.keys(values), {
        lines: { name: "lines", type: "one2many" },
        tags: { name: "tags", type: "many2many" },
        channels: { name: "channels", type: "multiselection" },
      }),
    ).toEqual(values);
  });

  it("applyFieldChange runs on_change then on_change_with", async () => {
    const client = {
      model: vi.fn(async (_m: string, method: string): Promise<JsonValue> => {
        if (method === "on_change_party") return { name: "from-on-change" };
        if (method === "on_change_with_code") return { code: "C1" };
        return {};
      }),
    };
    const patch = await applyFieldChange(
      client,
      "sale.sale",
      {
        party: { name: "party", type: "many2one", on_change: ["party"] },
        code: { name: "code", on_change_with: ["party"] },
      },
      { id: 1, party: [2, "P"] },
      "party",
    );
    expect(patch.name).toBe("from-on-change");
    expect(patch.code).toBe("C1");
  });

  it("calls pre_validate with one transient record and propagates server rejection", async () => {
    const rejection = new Error("invalid quantity");
    const client = {
      model: vi.fn(async (): Promise<JsonValue> => {
        throw rejection;
      }),
    };

    await expect(
      preValidateRecord(
        client,
        "sale.line",
        { id: -1, product: [9, "Product"], tags: [2, 3] },
        {
          product: { name: "product", type: "many2one" },
          tags: { name: "tags", type: "many2many" },
        },
        { company: 1 },
      ),
    ).rejects.toBe(rejection);
    expect(client.model).toHaveBeenCalledWith(
      "sale.line",
      "pre_validate",
      [{ id: -1, product: 9, tags: [2, 3] }],
      { company: 1 },
    );
  });
});
