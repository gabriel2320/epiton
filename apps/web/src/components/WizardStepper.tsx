import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type ParsedView,
  type RecordValues,
  parseWizardPayload,
  renderView,
} from "@epiton/view-engine";
import { useState } from "react";
import { useAppStore } from "../lib/store";

interface WizardRuntime {
  name: string;
  sessionId: string;
  state: string;
  view: ParsedView | null;
  values: RecordValues;
}

/** Full-screen style wizard stepper (Sao parity). */
export function WizardStepper() {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const [wizardName, setWizardName] = useState("ir.module.activate_upgrade");
  const [runtime, setRuntime] = useState<WizardRuntime | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "data">("idle");
  const [message, setMessage] = useState("Pick a wizard and start");

  async function start() {
    if (!client) return;
    setStatus("loading");
    try {
      const created = await client.call(`wizard.${wizardName}.create`, [{}, {}]);
      const sessionId = Array.isArray(created) ? String(created[0]) : String(created);
      const executed = await client.call(`wizard.${wizardName}.execute`, [
        sessionId,
        {},
        "start",
        {},
      ]);
      const parsed = parseWizardPayload(
        executed && typeof executed === "object" && !Array.isArray(executed)
          ? (executed as Record<string, unknown>)
          : { state: "end" },
      );
      setRuntime({
        name: wizardName,
        sessionId,
        state: parsed.state,
        view: parsed.view ?? null,
        values: parsed.defaults ?? {},
      });
      setStatus("data");
      setMessage(`Session ${sessionId}`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Wizard failed");
    }
  }

  async function next(transition = "end") {
    if (!client || !runtime) return;
    setStatus("loading");
    try {
      const executed = await client.call(`wizard.${runtime.name}.execute`, [
        runtime.sessionId,
        runtime.values as import("@epiton/protocol").JsonObject,
        transition,
        {},
      ]);
      const parsed = parseWizardPayload(
        executed && typeof executed === "object" && !Array.isArray(executed)
          ? (executed as Record<string, unknown>)
          : { state: transition },
      );
      setRuntime({
        ...runtime,
        state: parsed.state,
        view: parsed.view ?? runtime.view,
        values: { ...runtime.values, ...(parsed.defaults ?? {}) },
      });
      setStatus("data");
      setMessage(`State → ${parsed.state}`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Transition failed");
    }
  }

  async function deleteSession() {
    if (!client || !runtime) return;
    try {
      await client.call(`wizard.${runtime.name}.delete`, [runtime.sessionId, {}]);
    } catch {
      // ignore
    }
    setRuntime(null);
    setStatus("idle");
    setMessage("Wizard closed");
  }

  return (
    <Panel title="Wizard stepper">
      <div className="epiton-toolbar">
        <input
          value={wizardName}
          onChange={(e) => setWizardName(e.target.value)}
          aria-label="Wizard technical name"
          style={{ minWidth: "16rem" }}
        />
        <Button variant="primary" onClick={start}>
          Start
        </Button>
        <Button
          disabled={!runtime}
          onClick={() => next(runtime?.state === "start" ? "upgrade" : "end")}
        >
          Next
        </Button>
        <Button disabled={!runtime} onClick={deleteSession}>
          Close
        </Button>
      </div>
      <p role="status">
        {runtime ? `state: ${runtime.state}` : "no session"} · {message}
      </p>
      <StateBlock state={status === "idle" ? "empty" : status} message={message}>
        {runtime?.view
          ? renderView(runtime.view, {
              values: runtime.values,
              mode: "write",
              density,
              onChange: (name, value) =>
                setRuntime((r) => (r ? { ...r, values: { ...r.values, [name]: value } } : r)),
            })
          : null}
      </StateBlock>
    </Panel>
  );
}
