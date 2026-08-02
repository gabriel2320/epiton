import { describe, expect, it, vi } from "vitest";
import { EpitonClient, TrytonRpcError, trytonSeriesFromVersion } from "./index";

function rpcResponse(init: RequestInit | undefined, payload: Record<string, unknown>): Response {
  const request = JSON.parse(String(init?.body)) as { id: number };
  return new Response(JSON.stringify({ id: request.id, ...payload }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EpitonClient", () => {
  it("logs in and sends Session authorization", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      expect(init?.cache).toBe("no-store");
      expect(init?.credentials).toBe("omit");
      expect(init?.referrerPolicy).toBe("no-referrer");
      if (body.method === "common.db.login") {
        return rpcResponse(init, { result: [1, "tok-abc"] });
      }
      const auth = (init?.headers as Record<string, string>).Authorization ?? "";
      expect(auth.startsWith("Session ")).toBe(true);
      return rpcResponse(init, { result: [{ id: 1, name: "Acme" }] });
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
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      rpcResponse(init, { error: { code: 1, message: "Access denied" } }),
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
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      rpcResponse(init, { error: ["Invalid order", "trace redacted"] }),
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
      return rpcResponse(init, { result: [] });
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
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      rpcResponse(init, { result: "8.0.1" }),
    );
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const caps = await client.detectCapabilities();
    expect(caps.series).toBe("8.0");
    expect(caps.serverVersion).toBe("8.0.1");
    expect(caps.supportsBus).toBe(false);
    expect(caps.supportsRest).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports bus support only when the deployment enables it", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      rpcResponse(init, { result: "8.0.1" }),
    );
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      supportsBus: true,
    });

    const caps = await client.detectCapabilities();

    expect(caps.supportsBus).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("discovers a future series and negotiates the documented RPC suffix", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      if (!String(url).endsWith("/rpc/")) {
        return new Response("method not allowed", { status: 405 });
      }
      return rpcResponse(init, { result: "9.0.0" });
    });
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const caps = await client.detectCapabilities();

    expect(caps.series).toBe("9.0");
    expect(urls).toContain("http://localhost:8000/epiton_lab/");
    expect(urls).toContain("http://localhost:8000/epiton_lab/rpc/");
    expect(client.rpcUrl()).toBe("http://localhost:8000/epiton_lab/rpc/");
  });

  it("does not turn malformed or absent versions into guessed series", () => {
    expect(trytonSeriesFromVersion(null)).toBeNull();
    expect(trytonSeriesFromVersion("development")).toBeNull();
    expect(trytonSeriesFromVersion("  10.2.3rc1")).toBe("10.2");
  });

  it("rejects a response whose id does not match the request", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 999, result: [] }), {
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
      code: -32700,
      message: expect.stringContaining("id mismatch"),
    });
  });

  it("rejects ambiguous and malformed JSON-RPC error envelopes", async () => {
    const responses = [
      { id: 1, result: [], error: { code: 1, message: "ambiguous" } },
      { id: 2, error: { code: "1", message: "invalid" } },
    ];
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(responses.shift()), {
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

    await expect(client.call("model.party.party.read", [])).rejects.toMatchObject({ code: -32700 });
    await expect(client.call("model.party.party.read", [])).rejects.toMatchObject({ code: -32700 });
  });

  it("rejects invalid JSON instead of accepting an untyped backend response", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "x" });

    await expect(client.call("model.party.party.read", [])).rejects.toMatchObject({
      code: -32700,
      message: expect.stringContaining("invalid JSON"),
    });
  });

  it("drops the in-memory session and notifies its owner after an authenticated 401", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const onSessionInvalidated = vi.fn();
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onSessionInvalidated,
    });
    client.setSession({ login: "admin", userId: 1, session: "x" });

    await expect(client.call("model.party.party.read", [])).rejects.toMatchObject({ code: 401 });
    expect(client.getSession()).toBeNull();
    expect(onSessionInvalidated).toHaveBeenCalledOnce();
  });

  it("rejects coerced login credentials from a malformed backend response", async () => {
    const responses = [{ result: ["1", "token"] }, { result: [1, { token: "not-a-string" }] }];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      rpcResponse(init, responses.shift() ?? { result: null }),
    );
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.login("admin", "admin")).rejects.toMatchObject({ code: -32000 });
    await expect(client.login("admin", "admin")).rejects.toMatchObject({ code: -32000 });
    expect(client.getSession()).toBeNull();
  });

  it("rejects malformed search_read rows instead of exposing untyped data", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      rpcResponse(init, { result: [{ id: 1 }, null] }),
    );
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "x" });

    await expect(client.searchRead("party.party")).rejects.toMatchObject({ code: -32000 });
  });
});
