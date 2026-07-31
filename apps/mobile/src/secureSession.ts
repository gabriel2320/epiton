import { Preferences } from "@capacitor/preferences";

/** Mobile secure-ish session slot (prefer biometric store in a later iteration). */
export async function saveMobileSession(session: string): Promise<void> {
  await Preferences.set({ key: "epiton.session", value: session });
}

export async function loadMobileSession(): Promise<string | null> {
  const { value } = await Preferences.get({ key: "epiton.session" });
  return value;
}

export async function clearMobileSession(): Promise<void> {
  await Preferences.remove({ key: "epiton.session" });
}
