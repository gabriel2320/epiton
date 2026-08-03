import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EpitonClient } from "./EpitonClient";

export interface MountEpitonOptions {
  development: boolean;
}

/** Vite/native-shell adapter. Next mounts the same EpitonClient component. */
export function mountEpiton(options: MountEpitonOptions): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");

  createRoot(root).render(
    <StrictMode>
      <EpitonClient development={options.development} />
    </StrictMode>,
  );
}
