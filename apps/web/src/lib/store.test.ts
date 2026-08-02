import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

describe("authentication state boundary", () => {
  afterEach(() => useAppStore.getState().clearAuthentication());

  it("discards every user-scoped in-memory preference with the session", () => {
    const state = useAppStore.getState();
    state.setTheme("light");
    state.setDensity("compact");
    state.setPreset("accounting");
    state.setSession({ login: "first-user", userId: 7 });
    state.setPreferences({ language: "es" }, { user: 7 });
    state.setError("old-user-error");
    state.setCommandOpen(true);

    useAppStore.getState().clearAuthentication();

    expect(useAppStore.getState()).toMatchObject({
      theme: "dark",
      density: "comfortable",
      preset: "general",
      session: null,
      client: null,
      preferences: {},
      sessionContext: {},
      error: null,
      commandOpen: false,
    });
  });
});
