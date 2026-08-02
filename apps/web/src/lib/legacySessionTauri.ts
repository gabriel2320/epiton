import { invoke } from "@tauri-apps/api/core";

/** Ask the native shell to unlink the exact pre-memory-only session file. */
export async function clearLegacyTauriSession(): Promise<void> {
  await invoke("clear_legacy_session");
}
