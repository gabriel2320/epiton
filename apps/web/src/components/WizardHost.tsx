import { Button, Panel } from "@epiton/ui";
import { parseWizardPayload } from "@epiton/view-engine";
import { useState } from "react";
import { useAppStore } from "../lib/store";

/** Sao-parity: wizard host using Tryton wizard.* RPC methods when available. */
export function WizardHost() {
  const client = useAppStore((s) => s.client);
  const [log, setLog] = useState<string>("Idle");
  const [state, setState] = useState("start");

  async function startDemoWizard() {
    if (!client) return;
    setLog("Starting wizard…");
    try {
      // Compatible call pattern; specific wizard name depends on installed modules.
      const created = await client.call("wizard.ir.module.activate_upgrade.create", [{}, {}]);
      const sessionId = Array.isArray(created) ? String(created[0]) : String(created);
      const executed = await client.call("wizard.ir.module.activate_upgrade.execute", [
        sessionId,
        {},
        "start",
        {},
      ]);
      const parsed = parseWizardPayload(
        executed && typeof executed === "object" && !Array.isArray(executed)
          ? (executed as Record<string, unknown>)
          : { state: "done" },
      );
      setState(parsed.state);
      setLog(`Wizard session ${sessionId} → state ${parsed.state}`);
    } catch (err) {
      setLog(err instanceof Error ? err.message : "Wizard unavailable on this server");
    }
  }

  return (
    <Panel title="Wizards">
      <p style={{ color: "var(--epiton-muted)" }}>State: {state}</p>
      <Button onClick={startDemoWizard}>Probe activate_upgrade wizard</Button>
      <p role="status">{log}</p>
    </Panel>
  );
}
