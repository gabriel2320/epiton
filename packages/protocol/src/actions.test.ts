import { describe, expect, it, vi } from "vitest";
import { resolveWorkspaceModel } from "./actions";
import { EpitonClient } from "./index";

describe("resolveWorkspaceModel", () => {
  it("returns bare model names", async () => {
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(resolveWorkspaceModel(client, "party.party")).resolves.toBe("party.party");
  });

  it("resolves act_window references", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      expect(body.method).toBe("model.ir.action.act_window.search_read");
      return new Response(
        JSON.stringify({ id: 1, result: [{ id: 12, res_model: "company.company" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "tok" });
    await expect(resolveWorkspaceModel(client, "ir.action.act_window,12")).resolves.toBe(
      "company.company",
    );
  });

  it("rejects wizards and bare ir.action types", async () => {
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(resolveWorkspaceModel(client, "ir.action.wizard,3")).resolves.toBeNull();
    await expect(resolveWorkspaceModel(client, "ir.action.act_window")).resolves.toBeNull();
  });
});
