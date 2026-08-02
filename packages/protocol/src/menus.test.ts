import { describe, expect, it, vi } from "vitest";
import { EpitonClient } from "./index";
import { loadMenus, setMenuFavorite } from "./menus";

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

describe("Tryton menu contract", () => {
  it("loads all menu rows and merges server-owned favorites", async () => {
    const requests: Array<{ method: string; params: unknown[] }> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        id: number;
        method: string;
        params: unknown[];
      };
      requests.push({ method: body.method, params: body.params });
      if (body.method === "model.ir.ui.menu.favorite.get") {
        return rpcResult(init, [[2, "Companies", "tryton-company"]]);
      }
      return rpcResult(init, [
        { id: 1, name: "Root", parent: null, action: null },
        { id: 2, name: "Companies", parent: [1, "Root"], action: "ir.action.act_window,7" },
      ]);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);

    await expect(loadMenus(client, { language: "es" })).resolves.toEqual([
      { id: 1, name: "Root", parent: null, action: null, favorite: false },
      {
        id: 2,
        name: "Companies",
        parent: 1,
        action: "ir.action.act_window,7",
        favorite: true,
      },
    ]);
    expect(requests).toEqual(
      expect.arrayContaining([
        {
          method: "model.ir.ui.menu.search_read",
          params: [
            [["active", "=", true]],
            0,
            null,
            null,
            ["name", "parent", "action"],
            { language: "es" },
          ],
        },
        { method: "model.ir.ui.menu.favorite.get", params: [{ language: "es" }] },
      ]),
    );
  });

  it.each([
    [[{ id: "1", name: "Root", parent: null, action: null }], []],
    [[{ id: 1, name: "", parent: null, action: null }], []],
    [[{ id: 1, name: "Root", parent: [2], action: null }], []],
    [[{ id: 1, name: "Root", parent: null, action: 4 }], []],
    [[{ id: 1, name: "Root", parent: null, action: null }], [[1, "Root"]]],
  ])("rejects malformed backend menu data", async (rows, favorites) => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      return rpcResult(init, body.method === "model.ir.ui.menu.favorite.get" ? favorites : rows);
    });
    await expect(loadMenus(clientWithFetch(fetchImpl as unknown as typeof fetch))).rejects.toThrow(
      /ir\.ui\.menu/,
    );
  });

  it("uses the dedicated favorite set and unset methods", async () => {
    const requests: Array<{ method: string; params: unknown[] }> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        id: number;
        method: string;
        params: unknown[];
      };
      requests.push({ method: body.method, params: body.params });
      return rpcResult(init, null);
    });
    const client = clientWithFetch(fetchImpl as unknown as typeof fetch);

    await setMenuFavorite(client, 7, true, { language: "es" });
    await setMenuFavorite(client, 7, false, { language: "es" });
    expect(requests).toEqual([
      { method: "model.ir.ui.menu.favorite.set", params: [7, { language: "es" }] },
      { method: "model.ir.ui.menu.favorite.unset", params: [7, { language: "es" }] },
    ]);
    await expect(setMenuFavorite(client, 0, true)).rejects.toThrow(/positive integer/);
  });
});
