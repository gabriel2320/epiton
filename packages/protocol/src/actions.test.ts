import { describe, expect, it, vi } from "vitest";
import { openActionUrl, resolveAction, resolveWorkspaceModel } from "./actions";
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

function rpcResult(init: RequestInit | undefined, result: unknown): Response {
  const request = JSON.parse(String(init?.body)) as { id: number };
  return new Response(JSON.stringify({ id: request.id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveAction", () => {
  it("returns bare model names when not a registered wizard", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      expect(body.method).toBe("model.ir.action.wizard.search_read");
      return rpcResult(init, []);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveWorkspaceModel(client, "party.party")).resolves.toBe("party.party");
    await expect(resolveAction(client, "party.party")).resolves.toEqual({
      kind: "model",
      model: "party.party",
    });
  });

  it("detects bare wizard technical names", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return rpcResult(init, [{ id: 9, wiz_name: "ir.module.activate_upgrade" }]);
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
      if (body.method === "model.ir.action.act_window.domain.search_read") {
        return rpcResult(init, [
          { name: "Active", domain: '[["active", "=", true]]', count: true },
        ]);
      }
      expect(body.method).toBe("model.ir.action.act_window.search_read");
      return rpcResult(init, [
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
      ]);
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
      domains: [{ name: "Active", domain: [["active", "=", true]], count: true }],
    });
  });

  it("uses the active Tryton session context for action metadata", async () => {
    const requests: Array<{ method: string; params: unknown[] }> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      requests.push(body);
      if (body.method === "model.ir.action.act_window.domain.search_read") {
        return rpcResult(init, []);
      }
      return rpcResult(init, [
        { id: 12, res_model: "party.party", name: "Parties", domain: "[]", views: [] },
      ]);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);

    await resolveAction(client, "ir.action.act_window,12", {
      user: 7,
      company: 2,
      employee: 9,
    });

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.params.at(-1)).toEqual({ user: 7, company: 2, employee: 9 });
    }
  });

  it("resolves url actions", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return rpcResult(init, [{ id: 5, url: "https://example.test/docs", name: "Docs" }]);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.url,5")).resolves.toEqual({
      kind: "url",
      url: "https://example.test/docs",
      name: "Docs",
      actionId: 5,
    });
  });

  it("resolves wizard action references", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return rpcResult(init, [{ id: 3, wiz_name: "ir.translation.export" }]);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.wizard,3")).resolves.toEqual({
      kind: "wizard",
      wizard: "ir.translation.export",
      actionId: 3,
    });
  });

  it("resolves report action references", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return rpcResult(init, [{ id: 7, report_name: "party.label" }]);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.report,7")).resolves.toEqual({
      kind: "report",
      report: "party.label",
      actionId: 7,
    });
  });

  it("resolves polymorphic ir.action,{id} via concrete type", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      if (body.method === "model.ir.action.search_read") {
        return rpcResult(init, [{ id: 12, type: "ir.action.act_window" }]);
      }
      if (body.method === "model.ir.action.act_window.domain.search_read") {
        return rpcResult(init, []);
      }
      expect(body.method).toBe("model.ir.action.act_window.search_read");
      return rpcResult(init, [
        { id: 12, res_model: "party.party", name: "Parties", domain: "[]", views: [] },
      ]);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action,12")).resolves.toMatchObject({
      kind: "model",
      model: "party.party",
      actionId: 12,
    });
  });

  it("rejects incomplete ir.action types", async () => {
    const client = clientWithFetch(vi.fn() as unknown as typeof fetch);
    await expect(resolveAction(client, "ir.action.act_window")).resolves.toMatchObject({
      kind: "unsupported",
    });
  });

  it("blocks javascript: urls", () => {
    expect(openActionUrl("javascript:alert(1)")).toBe(false);
    expect(openActionUrl("")).toBe(false);
  });
});
