import { buildSessionContext, createClient, loadUserPreferences } from "@epiton/protocol";
import { useEffect, useState } from "react";
import { applyShellDataset, detectShell } from "./lib/nativeShell";
import { loadSecureSession } from "./lib/secureSessionBridge";
import { useAppStore } from "./lib/store";
import { applyClientLanguage } from "./lib/translations";
import { LoginPage } from "./pages/LoginPage";
import { Shell } from "./pages/Shell";

async function hydrateNativeSession(): Promise<boolean> {
  if (detectShell() === "web") return false;
  const saved = await loadSecureSession();
  if (!saved) return false;

  const store = useAppStore.getState();
  try {
    store.setConnection({ baseUrl: saved.baseUrl, database: saved.database });
    const client = createClient({
      baseUrl: saved.baseUrl,
      database: saved.database,
      correlationId: () => crypto.randomUUID(),
    });
    client.setSession({
      login: saved.login,
      userId: saved.userId,
      session: saved.session,
    });
    await client.detectCapabilities();
    const preferences = await loadUserPreferences(client);
    store.setPreferences(preferences, buildSessionContext(preferences, { user: saved.userId }));
    const lang =
      typeof preferences.language === "string"
        ? preferences.language
        : Array.isArray(preferences.language)
          ? String(preferences.language[0] ?? "en")
          : "en";
    await applyClientLanguage(client, lang);
    store.setClient(client);
    store.setSession({ login: saved.login, userId: saved.userId });
    return true;
  } catch {
    store.setClient(null);
    store.setSession(null);
    return false;
  }
}

export function App() {
  const session = useAppStore((s) => s.session);
  const theme = useAppStore((s) => s.theme);
  const [booting, setBooting] = useState(() => detectShell() !== "web");

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }, [theme]);

  useEffect(() => {
    applyShellDataset();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (detectShell() === "web") {
        setBooting(false);
        return;
      }
      await hydrateNativeSession();
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useAppStore.getState().setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (booting) {
    return (
      <div className="epiton-login" role="status">
        Restoring session…
      </div>
    );
  }

  if (!session) return <LoginPage />;
  return <Shell />;
}
