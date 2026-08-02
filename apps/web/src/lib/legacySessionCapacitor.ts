import { Preferences } from "@capacitor/preferences";

/** Remove the pre-memory-only Capacitor session slot. */
export async function clearLegacyCapacitorSession(key: string): Promise<void> {
  await Preferences.remove({ key });
}
