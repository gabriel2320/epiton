import { describe, expect, it, vi } from "vitest";
import { getModelAccess } from "./acl";
import type { EpitonClient } from "./index";

describe("getModelAccess", () => {
  it("normalizes the effective Tryton flags for the requested model", async () => {
    const model = vi.fn().mockResolvedValue({
      "gnuhealth.patient.evaluation": {
        read: 1,
        write: true,
        create: 1,
        delete: 0,
      },
    });
    const client = { model } as unknown as EpitonClient;

    await expect(
      getModelAccess(client, "gnuhealth.patient.evaluation", { language: "es" }),
    ).resolves.toEqual({ read: true, write: true, create: true, delete: false });
    expect(model).toHaveBeenCalledWith(
      "ir.model.access",
      "get_access",
      [["gnuhealth.patient.evaluation"]],
      { language: "es" },
    );
  });

  it("rejects malformed permissions so callers can fail closed", async () => {
    const client = {
      model: vi.fn().mockResolvedValue({
        "party.party": { read: 1, write: 1, create: 1 },
      }),
    } as unknown as EpitonClient;

    await expect(getModelAccess(client, "party.party")).rejects.toThrow("invalid delete flag");
  });
});
