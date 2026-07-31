import type { Density, WorkspacePreset } from "@epiton/intelligence";
import type { EpitonClient, JsonObject, SessionPreferences } from "@epiton/protocol";
import { create } from "zustand";

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

const saved =
  typeof localStorage !== "undefined" ? localStorage.getItem("epiton.connection") : null;

export const useAppStore = create<AppStore>((set) => ({
  theme: "dark",
  density: "comfortable",
  preset: "general",
  connection: saved
    ? (JSON.parse(saved) as ConnectionConfig)
    : { baseUrl: "http://localhost:8000", database: "epiton_lab" },
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
    localStorage.setItem("epiton.connection", JSON.stringify(connection));
    set({ connection });
  },
  setSession: (session) => set({ session }),
  setClient: (client) => set({ client }),
  setPreferences: (preferences, sessionContext) => set({ preferences, sessionContext }),
  setError: (error) => set({ error }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
