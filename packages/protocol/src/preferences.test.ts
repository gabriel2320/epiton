import { describe, expect, it, vi } from "vitest";
import type { EpitonClient } from "./index";
import { reloadSessionPreferences, saveUserPreferences } from "./preferences";
import {
  buildSessionContext,
  loadUserPreferences,
  requireUserPreferences,
} from "./session_context";

function clientWithModel(model: ReturnType<typeof vi.fn>): EpitonClient {
  return { model } as unknown as EpitonClient;
}

describe("preferences helpers", () => {
  it("buildSessionContext still merges after preference-shaped patch", () => {
    const ctx = buildSessionContext({ company: 1, language: "en" }, { user: 7 });
    expect(ctx.company).toBe(1);
    expect(ctx.user).toBe(7);
  });

  it("keeps the optional bootstrap preference read tolerant", async () => {
    const client = clientWithModel(vi.fn().mockRejectedValue(new Error("minimal lab")));
    await expect(loadUserPreferences(client)).resolves.toEqual({});
  });

  it("propagates a rejected preference write", async () => {
    const failure = new Error("company is not allowed");
    const client = clientWithModel(vi.fn().mockRejectedValue(failure));
    await expect(saveUserPreferences(client, { company: 2 })).rejects.toBe(failure);
  });

  it("requires a valid payload during an explicit reload", async () => {
    const client = clientWithModel(vi.fn().mockResolvedValue(null));
    await expect(requireUserPreferences(client)).rejects.toThrow(
      "invalid user preferences payload",
    );
  });

  it("reloads authoritative preferences after a successful write", async () => {
    const model = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ company: 2, language: "es", groups: [4] });
    const client = clientWithModel(model);

    await expect(reloadSessionPreferences(client, 7, { company: 2 })).resolves.toEqual({
      preferences: { company: 2, language: "es", groups: [4] },
      sessionContext: { company: 2, language: "es", groups: [4], user: 7 },
    });
    expect(model).toHaveBeenNthCalledWith(1, "res.user", "set_preferences", [{ company: 2 }], {});
    expect(model).toHaveBeenNthCalledWith(2, "res.user", "get_preferences", [false], {});
  });
});
