import { describe, expect, it, vi } from "vitest";
import { EpitonClient, TrytonRpcError } from "./index";

describe("EpitonClient", () => {
  it("logs in and sends Session authorization", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      if (body.method === "common.db.login") {
        return new Response(JSON.stringify({ id: 1, result: [1, "tok-abc"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const auth = (init?.headers as Record<string, string>).Authorization ?? "";
      expect(auth.startsWith("Session ")).toBe(true);
      return new Response(JSON.stringify({ id: 2, result: [{ id: 1, name: "Acme" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await client.login("admin", "admin");
    expect(session).toEqual({ login: "admin", userId: 1, session: "tok-abc" });

    const rows = await client.searchRead("party.party", [], ["name"]);
    expect(rows[0]?.name).toBe("Acme");
  });

  it("raises TrytonRpcError on JSON-RPC error", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 1, error: { code: 1, message: "Access denied" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "x" });

    await expect(client.call("model.party.party.read", [[1], ["name"], {}])).rejects.toBeInstanceOf(
      TrytonRpcError,
    );
  });

  it("raises a useful error for Tryton's legacy error tuple", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 1, error: ["Invalid order", "trace redacted"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "x" });

    await expect(client.call("model.party.party.read", [[1], ["name"], {}])).rejects.toMatchObject({
      message: "Invalid order",
      code: -32000,
    });
  });

  it("normalizes compact search order strings to Tryton order pairs", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { params: unknown[] };
      expect(body.params[3]).toEqual([
        ["name", "ASC"],
        ["id", "DESC"],
      ]);
      return new Response(JSON.stringify({ id: 1, result: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "x" });

    await client.searchRead("party.party", [], ["name"], 0, 10, "name ASC, id DESC");
  });

  it("detects series from common.server.version", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/bus")) {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(JSON.stringify({ id: 1, result: "8.0.1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const caps = await client.detectCapabilities();
    expect(caps.series).toBe("8");
    expect(caps.serverVersion).toBe("8.0.1");
    expect(caps.supportsBus).toBe(true);
    expect(caps.supportsRest).toBe(false);
  });
});
