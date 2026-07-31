import { describe, expect, it } from "vitest";
import { resolveRuntimeConnectionPolicy } from "./runtimeConfig";

describe("runtime connection policy", () => {
  it("pins production web to the same origin", () => {
    expect(
      resolveRuntimeConnectionPolicy({
        production: true,
        shell: "web",
        origin: "https://erp.example.test",
        configuredGateway: "/tryton/",
      }),
    ).toEqual({ baseUrl: "https://erp.example.test/tryton", serverLocked: true });
  });

  it("rejects a cross-origin production web gateway", () => {
    expect(() =>
      resolveRuntimeConnectionPolicy({
        production: true,
        shell: "web",
        origin: "https://erp.example.test",
        configuredGateway: "https://tryton.example.test",
      }),
    ).toThrow("same-origin");
  });

  it("allows an explicit endpoint for a native shell", () => {
    expect(
      resolveRuntimeConnectionPolicy({
        production: true,
        shell: "tauri",
        origin: "http://localhost",
        configuredGateway: "https://tryton.example.test/",
      }),
    ).toEqual({ baseUrl: "https://tryton.example.test", serverLocked: false });
  });

  it("rejects credentials embedded in URLs", () => {
    expect(() =>
      resolveRuntimeConnectionPolicy({
        production: false,
        shell: "web",
        origin: "http://localhost:5173",
        configuredGateway: "http://admin:secret@localhost:8080",
      }),
    ).toThrow("credentials");
  });

  it("rejects non-HTTP gateway schemes", () => {
    expect(() =>
      resolveRuntimeConnectionPolicy({
        production: true,
        shell: "tauri",
        origin: "http://localhost",
        configuredGateway: "file:///tmp/tryton.sock",
      }),
    ).toThrow("HTTP or HTTPS");
  });
});
