import { describe, expect, it, vi } from "vitest";
import { resolveAction, resolveWorkspaceModel } from "./actions";
import { EpitonClient } from "./index";

function clientWithFetch(fetchImpl: typeof fetch) {
  const client = new EpitonClient({
    baseUrl: "http://localhost:8000",
    database: "epiton_lab",
    fetchImpl,
  });
  client.setSession({ login: "admin", userId: 1, session: "tok" });
  return client;
}

describe("resolveAction", () => {
  it("returns bare model names when not a registered wizard", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      expect(body.method).toBe("model.ir.action.wizard.search_read");
      return new Response(JSON.stringify({ id: 1, result: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveWorkspaceModel(client, "party.party")).resolves.toBe("party.party");
    await expect(resolveAction(client, "party.party")).resolves.toEqual({
      kind: "model",
      model: "party.party",
    });
  });

  it("detects bare wizard technical names", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 1,
          result: [{ id: 9, wiz_name: "ir.module.activate_upgrade" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.module.activate_upgrade")).resolves.toEqual({
      kind: "wizard",
      wizard: "ir.module.activate_upgrade",
      actionId: 9,
    });
  });

  it("resolves act_window references with domain/context", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      expect(body.method).toBe("model.ir.action.act_window.search_read");
      return new Response(
        JSON.stringify({
          id: 1,
          result: [
            {
              id: 12,
              res_model: "company.company",
              name: "Companies",
              domain: '[["active", "=", true]]',
              context: { company: 1 },
              views: [
                [null, "tree"],
                [null, "form"],
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.act_window,12")).resolves.toEqual({
      kind: "model",
      model: "company.company",
      actionId: 12,
      name: "Companies",
      domain: [["active", "=", true]],
      context: { company: 1 },
      views: [
        [null, "tree"],
        [null, "form"],
      ],
    });
  });

  it("resolves wizard action references", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ id: 1, result: [{ id: 3, wiz_name: "ir.translation.export" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.wizard,3")).resolves.toEqual({
      kind: "wizard",
      wizard: "ir.translation.export",
      actionId: 3,
    });
  });

  it("resolves report action references", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ id: 1, result: [{ id: 7, report_name: "party.label" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.report,7")).resolves.toEqual({
      kind: "report",
      report: "party.label",
      actionId: 7,
    });
  });

  it("rejects incomplete ir.action types", async () => {
    const client = clientWithFetch(vi.fn() as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.act_window")).resolves.toMatchObject({
      kind: "unsupported",
    });
  });
});
