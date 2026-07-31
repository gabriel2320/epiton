import { useEffect, useState } from "react";
import { applyShellDataset, detectShell } from "./lib/nativeShell";
import { clearSecureSession } from "./lib/secureSessionBridge";
import { useAppStore } from "./lib/store";
import { LoginPage } from "./pages/LoginPage";
import { Shell } from "./pages/Shell";

async function hydrateNativeSession(): Promise<boolean> {
  if (detectShell() === "web") return false;
  // Remove tokens written by pre-hardening native builds. Native beta now uses
  // the same memory-only lifecycle as web until an audited secret store exists.
  await clearSecureSession();
  return false;
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
        Preparing secure session…
      </div>
    );
  }

  if (!session) return <LoginPage />;
  return <Shell />;
}
