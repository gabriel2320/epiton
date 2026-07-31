import { Preferences } from "@capacitor/preferences";

/** Mobile secure session slot (JSON payload; prefer biometric store later). */
const KEY = "epiton.session.v1";

export async function saveMobileSession(payload: string): Promise<void> {
  await Preferences.set({ key: KEY, value: payload });
}

export async function loadMobileSession(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY });
  return value;
}

export async function clearMobileSession(): Promise<void> {
  await Preferences.remove({ key: KEY });
}
