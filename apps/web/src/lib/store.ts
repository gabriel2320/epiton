import type { Density, WorkspacePreset } from "@epiton/intelligence";
import type { EpitonClient, JsonObject, SessionPreferences } from "@epiton/protocol";
import { create } from "zustand";
import { normalizeConnectionBaseUrl, runtimeConnectionPolicy } from "./runtimeConfig";

export type UiState = "loading" | "empty" | "error" | "data";

interface ConnectionConfig {
  baseUrl: string;
  database: string;
}

interface SessionState {
  login: string;
  userId: number;
}

interface AppStore {
  theme: "dark" | "light";
  density: Density;
  preset: WorkspacePreset;
  connection: ConnectionConfig;
  session: SessionState | null;
  client: EpitonClient | null;
  preferences: SessionPreferences;
  sessionContext: JsonObject;
  error: string | null;
  commandOpen: boolean;
  setTheme: (theme: "dark" | "light") => void;
  setDensity: (density: Density) => void;
  setPreset: (preset: WorkspacePreset) => void;
  setConnection: (connection: ConnectionConfig) => void;
  setSession: (session: SessionState | null) => void;
  setClient: (client: EpitonClient | null) => void;
  setPreferences: (preferences: SessionPreferences, sessionContext: JsonObject) => void;
  setError: (error: string | null) => void;
  setCommandOpen: (open: boolean) => void;
}

const runtimePolicy = runtimeConnectionPolicy();

function loadConnection(): ConnectionConfig {
  const fallback = { baseUrl: runtimePolicy.baseUrl, database: "epiton_lab" };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const saved = localStorage.getItem("epiton.connection");
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<ConnectionConfig>;
    return {
      baseUrl:
        runtimePolicy.serverLocked || typeof parsed.baseUrl !== "string"
          ? runtimePolicy.baseUrl
          : normalizeConnectionBaseUrl(parsed.baseUrl),
      database:
        typeof parsed.database === "string" && parsed.database.trim()
          ? parsed.database
          : fallback.database,
    };
  } catch {
    return fallback;
  }
}

export const useAppStore = create<AppStore>((set) => ({
  theme: "dark",
  density: "comfortable",
  preset: "general",
  connection: loadConnection(),
  session: null,
  client: null,
  preferences: {},
  sessionContext: {},
  error: null,
  commandOpen: false,
  setTheme: (theme) => set({ theme }),
  setDensity: (density) => set({ density }),
  setPreset: (preset) => set({ preset }),
  setConnection: (connection) => {
    const safeConnection = {
      ...connection,
      baseUrl: runtimePolicy.serverLocked ? runtimePolicy.baseUrl : connection.baseUrl,
    };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("epiton.connection", JSON.stringify(safeConnection));
    }
    set({ connection: safeConnection });
  },
  setSession: (session) => set({ session }),
  setClient: (client) => set({ client }),
  setPreferences: (preferences, sessionContext) => set({ preferences, sessionContext }),
  setError: (error) => set({ error }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
