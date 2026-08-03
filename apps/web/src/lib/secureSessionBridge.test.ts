import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSecureSession, loadSecureSession, saveSecureSession } from "./secureSessionBridge";

const legacy = vi.hoisted(() => ({
  clearTauri: vi.fn<() => Promise<void>>(),
  clearCapacitor: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock("./legacySessionTauri", () => ({
  clearLegacyTauriSession: legacy.clearTauri,
}));

vi.mock("./legacySessionCapacitor", () => ({
  clearLegacyCapacitorSession: legacy.clearCapacitor,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  legacy.clearTauri.mockReset();
  legacy.clearCapacitor.mockReset();
});

describe("secure session bridge", () => {
  it("never persists or hydrates session tokens", async () => {
    await expect(
      saveSecureSession({
        login: "demo",
        userId: 1,
        session: "secret",
        baseUrl: "https://epiton.example.test",
        database: "health",
      }),
    ).resolves.toBe(false);
    await expect(loadSecureSession()).resolves.toBeNull();
  });

  it("does not load a native adapter in the browser", async () => {
    vi.stubGlobal("window", {});

    await expect(clearSecureSession()).resolves.toBe(false);
    expect(legacy.clearTauri).not.toHaveBeenCalled();
    expect(legacy.clearCapacitor).not.toHaveBeenCalled();
  });

  it("clears the legacy Tauri store through a CSP-compatible module", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    legacy.clearTauri.mockResolvedValue();

    await expect(clearSecureSession()).resolves.toBe(true);
    expect(legacy.clearTauri).toHaveBeenCalledOnce();
  });

  it("clears the legacy Capacitor preference through a CSP-compatible module", async () => {
    vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true } });
    legacy.clearCapacitor.mockResolvedValue();

    await expect(clearSecureSession()).resolves.toBe(true);
    expect(legacy.clearCapacitor).toHaveBeenCalledWith("epiton.session.v1");
  });

  it("soft-fails when a native cleanup adapter rejects", async () => {
    vi.stubGlobal("window", { __TAURI__: {} });
    legacy.clearTauri.mockRejectedValue(new Error("plugin unavailable"));

    await expect(clearSecureSession()).resolves.toBe(false);
  });
});
