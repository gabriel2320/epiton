import { describe, expect, it, vi } from "vitest";
import { EpitonClient } from "./index";
import { wizardCreate, wizardDataForState, wizardExecute } from "./wizards";

describe("wizard helpers", () => {
  it("builds state-keyed data payloads", () => {
    expect(wizardDataForState("start", { module: "party" })).toEqual({
      start: { module: "party" },
    });
  });

  it("creates a session from [id, start, end]", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 1, result: [42, "start", "end"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "tok" });
    const session = await wizardCreate(client, "ir.module.activate_upgrade", {});
    expect(session).toEqual({
      name: "ir.module.activate_upgrade",
      sessionId: "42",
      startState: "start",
      endState: "end",
    });
  });

  it("executes with Sao-shaped params", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      expect(body.method).toBe("wizard.ir.module.activate_upgrade.execute");
      expect(body.params[0]).toBe("42");
      expect(body.params[2]).toBe("start");
      return new Response(
        JSON.stringify({
          id: 1,
          result: {
            view: {
              state: "start",
              fields_view: {
                arch: `<form><field name="module"/></form>`,
                fields: { module: { type: "char", string: "Module" } },
              },
              defaults: { module: "party" },
              values: {},
              buttons: [{ state: "end", string: "Cancel", default: false }],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new EpitonClient({
      baseUrl: "http://localhost:8000",
      database: "epiton_lab",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    client.setSession({ login: "admin", userId: 1, session: "tok" });
    const result = await wizardExecute(
      client,
      { name: "ir.module.activate_upgrade", sessionId: "42" },
      {},
      "start",
      {},
    );
    expect(result.raw.view).toBeTruthy();
  });
});
