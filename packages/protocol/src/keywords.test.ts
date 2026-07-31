import { describe, expect, it } from "vitest";
import type { EpitonClient, JsonObject, JsonValue } from "./index";
import { getKeywords } from "./keywords";

function mockClient(result: JsonValue): EpitonClient {
  return {
    model: async () => result,
  } as unknown as EpitonClient;
}

describe("keywords", () => {
  it("maps get_keyword rows to refs", async () => {
    const rows: JsonObject[] = [
      { id: 4, type: "ir.action.act_window", name: "Addresses" },
      { id: 9, type: "ir.action.report", name: "Label" },
    ];
    const actions = await getKeywords(mockClient(rows), "form_relate", "party.party", 1);
    expect(actions).toEqual([
      {
        id: 4,
        type: "ir.action.act_window",
        name: "Addresses",
        keyword: "form_relate",
        ref: "ir.action.act_window,4",
        raw: rows[0],
      },
      {
        id: 9,
        type: "ir.action.report",
        name: "Label",
        keyword: "form_relate",
        ref: "ir.action.report,9",
        raw: rows[1],
      },
    ]);
  });

  it("soft-fails to empty", async () => {
    const client = {
      model: async () => {
        throw new Error("no keyword");
      },
    } as unknown as EpitonClient;
    expect(await getKeywords(client, "form_print", "party.party", null)).toEqual([]);
  });
});
