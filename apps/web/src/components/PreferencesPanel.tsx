import { buildSessionContext, reloadSessionPreferences } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import { useState } from "react";
import { useAppStore } from "../lib/store";

/** Edit common Tryton session preferences (company / language). */
export function PreferencesPanel() {
  const client = useAppStore((s) => s.client);
  const session = useAppStore((s) => s.session);
  const preferences = useAppStore((s) => s.preferences);
  const setPreferences = useAppStore((s) => s.setPreferences);

  const [company, setCompany] = useState(String(preferences.company ?? ""));
  const [language, setLanguage] = useState(String(preferences.language ?? ""));
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "data">("idle");
  const [message, setMessage] = useState("Adjust company / language and save");

  async function save() {
    if (!client || !session) return;
    setStatus("loading");
    setMessage("Saving preferences…");
    const patch: Record<string, string | number> = {};
    const companyNum = Number(company);
    if (company.trim() && Number.isFinite(companyNum)) patch.company = companyNum;
    if (language.trim()) patch.language = language.trim();
    try {
      const next = await reloadSessionPreferences(client, session.userId, patch);
      setPreferences(next.preferences, next.sessionContext);
      setCompany(String(next.preferences.company ?? company));
      setLanguage(String(next.preferences.language ?? language));
      setStatus("data");
      setMessage("Preferences saved");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function reload() {
    if (!client || !session) return;
    setStatus("loading");
    try {
      const next = await reloadSessionPreferences(client, session.userId);
      setPreferences(next.preferences, next.sessionContext);
      setCompany(String(next.preferences.company ?? ""));
      setLanguage(String(next.preferences.language ?? ""));
      setStatus("data");
      setMessage("Preferences reloaded");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Reload failed");
    }
  }

  return (
    <Panel title="Preferences">
      <StateBlock state={status === "idle" ? "empty" : status} message={message}>
        <div className="epiton-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>
            Company id
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              inputMode="numeric"
              aria-label="Company id"
            />
          </label>
          <label>
            Language
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en / es / …"
              aria-label="Language"
            />
          </label>
          <div className="epiton-toolbar">
            <Button variant="primary" onClick={() => void save()}>
              Save
            </Button>
            <Button onClick={() => void reload()}>Reload</Button>
          </div>
          <p className="text-sm text-[var(--epiton-muted)]">
            Session context keys:{" "}
            {Object.keys(buildSessionContext(preferences)).slice(0, 8).join(", ") || "—"}
          </p>
        </div>
      </StateBlock>
    </Panel>
  );
}
