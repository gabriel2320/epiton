import { type JsonObject, buildSessionContext, reloadSessionPreferences } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import { type RecordValues, parseFieldsViewGet, renderView } from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store";
import { applyClientLanguage } from "../lib/translations";

/** Preferences form from res.user fields_view_get (preferences context). */
export function PreferencesPanel() {
  const client = useAppStore((s) => s.client);
  const session = useAppStore((s) => s.session);
  const preferences = useAppStore((s) => s.preferences);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const density = useAppStore((s) => s.density);
  const setPreferences = useAppStore((s) => s.setPreferences);

  const [draft, setDraft] = useState<RecordValues>({ ...preferences });
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "data">("idle");
  const [message, setMessage] = useState("Load preferences form from server");

  const viewQuery = useQuery({
    queryKey: ["res.user", "preferences-view"],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return parseFieldsViewGet(
          await client.fieldsViewGet("res.user", null, "form", {
            ...sessionContext,
            preferences: true,
          }),
        );
      } catch {
        return parseFieldsViewGet({
          arch: `<form><group string="Preferences"><field name="company"/><field name="language"/><field name="employee"/></group></form>`,
          fields: {
            company: { type: "many2one", string: "Company", relation: "company.company" },
            language: { type: "char", string: "Language" },
            employee: { type: "many2one", string: "Employee" },
          },
        });
      }
    },
  });

  useEffect(() => {
    setDraft({ ...preferences });
  }, [preferences]);

  async function save() {
    if (!client || !session) return;
    setStatus("loading");
    setMessage("Saving preferences…");
    const patch: JsonObject = {};
    const fields = viewQuery.data?.fields ?? {};
    const keys = Object.keys(fields).length
      ? Object.keys(fields)
      : ["company", "language", "employee"];
    for (const key of keys) {
      if (!(key in draft)) continue;
      const raw = draft[key];
      if (Array.isArray(raw) && typeof raw[0] === "number") {
        patch[key] = raw[0];
      } else if (raw !== undefined) {
        patch[key] = raw as JsonObject[string];
      }
    }
    try {
      const next = await reloadSessionPreferences(client, session.userId, patch);
      setPreferences(next.preferences, next.sessionContext);
      setDraft({ ...next.preferences });
      const lang =
        typeof next.preferences.language === "string"
          ? next.preferences.language
          : Array.isArray(next.preferences.language)
            ? String(next.preferences.language[0] ?? "")
            : "";
      if (lang) await applyClientLanguage(client, lang);
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
      setDraft({ ...next.preferences });
      setStatus("data");
      setMessage("Preferences reloaded");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Reload failed");
    }
  }

  const blockState = status === "idle" ? (viewQuery.isLoading ? "loading" : "empty") : status;

  return (
    <Panel title="Preferences">
      <StateBlock state={blockState} message={message}>
        {viewQuery.data ? (
          renderView(viewQuery.data, {
            values: draft,
            mode: "write",
            density,
            model: "res.user",
            onChange: (name, value) => setDraft((d) => ({ ...d, [name]: value })),
          })
        ) : (
          <div
            className="epiton-toolbar"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            <label>
              Company id
              <input
                value={String(draft.company ?? "")}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, company: Number(e.target.value) || e.target.value }))
                }
                inputMode="numeric"
                aria-label="Company id"
              />
            </label>
            <label>
              Language
              <input
                value={String(draft.language ?? "")}
                onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                aria-label="Language"
              />
            </label>
          </div>
        )}
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
      </StateBlock>
    </Panel>
  );
}
