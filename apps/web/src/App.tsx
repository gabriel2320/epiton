import { useEffect } from "react";
import { useAppStore } from "./lib/store";
import { LoginPage } from "./pages/LoginPage";
import { Shell } from "./pages/Shell";

export function App() {
  const session = useAppStore((s) => s.session);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }, [theme]);

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

  if (!session) return <LoginPage />;
  return <Shell />;
}
