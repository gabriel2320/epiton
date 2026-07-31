import type { Density, WorkspacePreset } from "@epiton/intelligence";
import type { EpitonClient } from "@epiton/protocol";
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
  error: string | null;
  commandOpen: boolean;
  setTheme: (theme: "dark" | "light") => void;
  setDensity: (density: Density) => void;
  setPreset: (preset: WorkspacePreset) => void;
  setConnection: (connection: ConnectionConfig) => void;
  setSession: (session: SessionState | null) => void;
  setClient: (client: EpitonClient | null) => void;
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
  setError: (error) => set({ error }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
