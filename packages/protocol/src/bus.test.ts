import { describe, expect, it, vi } from "vitest";
import { pollBus } from "./bus";
import { BusClient } from "./busClient";

describe("Tryton bus transport", () => {
  it("polls without browser credentials, referrers, or HTTP caching", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      return new Response(JSON.stringify({ message: null, timestamp: 4 }), { status: 200 });
    });

    await expect(
      pollBus("http://localhost/db/bus", "Session auth", ["client"], null, fetchImpl),
    ).resolves.toEqual({ message: null, timestamp: 4 });
  });

  it("stops immediately and invalidates the owner when the backend rejects the session", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      return new Response(null, { status: 401 });
    });
    const onSessionInvalidated = vi.fn();
    const bus = new BusClient(
      "http://localhost/db/bus",
      { login: "admin", userId: 1, session: "token" },
      { fetchImpl, onSessionInvalidated },
    );

    await expect(bus.listen(["client"]).next()).resolves.toEqual({ done: true, value: undefined });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(onSessionInvalidated).toHaveBeenCalledOnce();
  });
});
