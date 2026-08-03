import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { discardBackendProjection } from "./lib/backendTruth";
import { clearLegacyBrowserPersistence } from "./lib/legacyBrowserPersistence";
import { applyShellDataset, detectShell } from "./lib/nativeShell";
import { clearSecureSession } from "./lib/secureSessionBridge";
import { clearClientAuthentication } from "./lib/sessionBoundary";
import { useAppStore } from "./lib/store";
import { LoginPage } from "./screens/LoginPage";
import { Shell } from "./screens/Shell";

async function hydrateNativeSession(): Promise<boolean> {
  if (detectShell() === "web") return false;
  // Remove tokens written by pre-hardening native builds. Native beta now uses
  // the same memory-only lifecycle as web until an audited secret store exists.
  await clearSecureSession();
  return false;
}

export function App() {
  const queryClient = useQueryClient();
  const session = useAppStore((s) => s.session);
  const theme = useAppStore((s) => s.theme);
  const [booting, setBooting] = useState(() => detectShell() !== "web");

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }, [theme]);

  useEffect(() => {
    applyShellDataset();
    clearLegacyBrowserPersistence();
  }, []);

  useEffect(() => {
    if (!session) discardBackendProjection(queryClient);
  }, [queryClient, session]);

  useEffect(() => {
    const onPageHide = () => clearClientAuthentication(queryClient);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [queryClient]);

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
