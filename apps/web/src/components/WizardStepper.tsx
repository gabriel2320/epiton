import {
  type JsonObject,
  applyFieldChange,
  wizardCreate,
  wizardDataForState,
  wizardDelete,
  wizardExecute,
} from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type ParsedView,
  type RecordValues,
  type WizardButton,
  parseWizardPayload,
  renderView,
} from "@epiton/view-engine";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store";

interface WizardRuntime {
  name: string;
  sessionId: string;
  startState: string;
  endState: string;
  state: string;
  screenState: string | null;
  view: ParsedView | null;
  values: RecordValues;
  buttons: WizardButton[];
  context: JsonObject;
}

const DEFAULT_WIZARDS = ["ir.module.activate_upgrade", "ir.translation.export", "res.user.config"];

/** Sao-compatible wizard stepper: create → execute(state) → button transitions → delete. */
export function WizardStepper(props: {
  initialWizard?: string | null;
  activeId?: number | null;
  activeIds?: number[];
  activeModel?: string | null;
  actionId?: number | null;
  autoStart?: boolean;
  /** Called when wizard ends with Tryton actions to open. */
  onActions?: (actions: unknown[]) => void;
}) {
  const client = useAppStore((s) => s.client);
  const density = useAppStore((s) => s.density);
  const [wizardName, setWizardName] = useState(props.initialWizard ?? "ir.module.activate_upgrade");
  const [runtime, setRuntime] = useState<WizardRuntime | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "data">("idle");
  const [message, setMessage] = useState("Pick a wizard and start");
  const onActionsRef = useRef(props.onActions);
  onActionsRef.current = props.onActions;
  const runtimeRef = useRef<WizardRuntime | null>(null);
  runtimeRef.current = runtime;
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildContext(): JsonObject {
    const ctx: JsonObject = {};
    if (props.activeId != null) ctx.active_id = props.activeId;
    if (props.activeIds?.length) ctx.active_ids = props.activeIds;
    else if (props.activeId != null) ctx.active_ids = [props.activeId];
    if (props.activeModel) ctx.active_model = props.activeModel;
    if (props.actionId != null) ctx.action_id = props.actionId;
    return ctx;
  }

  function handleFieldChange(name: string, value: unknown) {
    setRuntime((r) => (r ? { ...r, values: { ...r.values, [name]: value } } : r));
    if (!client) return;
    if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    onChangeTimer.current = setTimeout(() => {
      void (async () => {
        const current = runtimeRef.current;
        if (!client || !current?.view) return;
        const fieldsMeta: Record<
          string,
          { name: string; on_change?: string[]; on_change_with?: string[] }
        > = {};
        for (const [fname, field] of Object.entries(current.view.fields)) {
          fieldsMeta[fname] = {
            name: fname,
            on_change: field.on_change,
            on_change_with: field.on_change_with,
          };
        }
        try {
          const patch = await applyFieldChange(
            client,
            current.name,
            fieldsMeta,
            { ...current.values, [name]: value },
            name,
            current.context,
          );
          if (!Object.keys(patch).length) return;
          setRuntime((r) => (r ? { ...r, values: { ...r.values, ...patch } } : r));
        } catch {
          /* soft-fail */
        }
      })();
    }, 250);
  }

  async function start(name = wizardName) {
    if (!client) return;
    setWizardName(name);
    setStatus("loading");
    try {
      const context = buildContext();
      const session = await wizardCreate(client, name, context);
      const executed = await wizardExecute(client, session, {}, session.startState, context);
      const parsed = parseWizardPayload(executed.raw as Record<string, unknown>);
      if (parsed.ended) {
        await wizardDelete(client, session, context);
        setRuntime(null);
        setStatus("idle");
        if (parsed.actions.length) onActionsRef.current?.(parsed.actions);
        setMessage(
          parsed.actions.length
            ? `Finished with ${parsed.actions.length} action(s)`
            : "Wizard finished immediately",
        );
        return;
      }
      setRuntime({
        name: session.name,
        sessionId: session.sessionId,
        startState: session.startState,
        endState: session.endState,
        state: parsed.state,
        screenState: parsed.state,
        view: parsed.view ?? null,
        values: { ...(parsed.defaults ?? {}), ...(parsed.values ?? {}) },
        buttons: parsed.buttons,
        context,
      });
      setStatus("data");
      setMessage(`Session ${session.sessionId} · state ${parsed.state}`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Wizard failed");
    }
  }

  async function transitionTo(nextState: string, button?: WizardButton) {
    if (!client || !runtime) return;
    if (button?.validate !== false && runtime.view) {
      // Default: validate when button.validate is true; also when explicitly required fields empty
      if (button?.validate) {
        for (const [name, field] of Object.entries(runtime.view.fields)) {
          if (!field.required) continue;
          const v = runtime.values[name];
          if (v == null || v === "") {
            setStatus("error");
            setMessage(`Required field: ${field.string ?? name}`);
            return;
          }
        }
      }
    }
    setStatus("loading");
    try {
      const data =
        runtime.screenState != null
          ? wizardDataForState(runtime.screenState, runtime.values as JsonObject)
          : {};
      // Sao executes the end state with current data before deleting the session.
      if (nextState === runtime.endState) {
        const executed = await wizardExecute(client, runtime, data, nextState, runtime.context);
        const parsed = parseWizardPayload(executed.raw as Record<string, unknown>);
        await wizardDelete(client, runtime, runtime.context);
        setRuntime(null);
        setStatus("idle");
        if (parsed.actions.length) onActionsRef.current?.(parsed.actions);
        setMessage(
          parsed.actions.length
            ? `Finished with ${parsed.actions.length} action(s)`
            : "Wizard closed",
        );
        return;
      }
      const executed = await wizardExecute(client, runtime, data, nextState, runtime.context);
      const parsed = parseWizardPayload(executed.raw as Record<string, unknown>);
      if (parsed.ended || !parsed.view) {
        await wizardDelete(client, runtime, runtime.context);
        setRuntime(null);
        setStatus("idle");
        if (parsed.actions.length) onActionsRef.current?.(parsed.actions);
        setMessage(
          parsed.actions.length ? `Ended with ${parsed.actions.length} action(s)` : "Wizard ended",
        );
        return;
      }
      setRuntime({
        ...runtime,
        state: parsed.state,
        screenState: parsed.state,
        view: parsed.view,
        values: { ...(parsed.defaults ?? {}), ...(parsed.values ?? {}) },
        buttons: parsed.buttons,
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
      await wizardDelete(client, runtime, runtime.context);
    } catch {
      // ignore
    }
    setRuntime(null);
    setStatus("idle");
    setMessage("Wizard closed");
  }

  useEffect(() => {
    if (props.initialWizard) setWizardName(props.initialWizard);
  }, [props.initialWizard]);

  useEffect(() => {
    const wizard = props.initialWizard;
    if (!(props.autoStart && wizard && client)) return;
    let cancelled = false;
    void (async () => {
      setWizardName(wizard);
      setStatus("loading");
      try {
        const context: JsonObject = {};
        if (props.activeId != null) context.active_id = props.activeId;
        if (props.activeIds?.length) context.active_ids = props.activeIds;
        else if (props.activeId != null) context.active_ids = [props.activeId];
        if (props.activeModel) context.active_model = props.activeModel;
        if (props.actionId != null) context.action_id = props.actionId;
        const session = await wizardCreate(client, wizard, context);
        if (cancelled) return;
        const executed = await wizardExecute(client, session, {}, session.startState, context);
        if (cancelled) return;
        const parsed = parseWizardPayload(executed.raw as Record<string, unknown>);
        if (parsed.ended) {
          await wizardDelete(client, session, context);
          if (!cancelled) {
            setRuntime(null);
            setStatus("idle");
            if (parsed.actions.length) onActionsRef.current?.(parsed.actions);
            setMessage(
              parsed.actions.length
                ? `Finished with ${parsed.actions.length} action(s)`
                : "Wizard finished immediately",
            );
          }
          return;
        }
        if (!cancelled) {
          setRuntime({
            name: session.name,
            sessionId: session.sessionId,
            startState: session.startState,
            endState: session.endState,
            state: parsed.state,
            screenState: parsed.state,
            view: parsed.view ?? null,
            values: { ...(parsed.defaults ?? {}), ...(parsed.values ?? {}) },
            buttons: parsed.buttons,
            context,
          });
          setStatus("data");
          setMessage(`Session ${session.sessionId} · state ${parsed.state}`);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Wizard failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    props.autoStart,
    props.initialWizard,
    props.activeId,
    props.activeIds,
    props.activeModel,
    props.actionId,
    client,
  ]);

  useEffect(() => {
    return () => {
      if (onChangeTimer.current) clearTimeout(onChangeTimer.current);
    };
  }, []);

  return (
    <Panel title="Wizard">
      <div className="epiton-toolbar">
        <input
          value={wizardName}
          onChange={(e) => setWizardName(e.target.value)}
          aria-label="Wizard technical name"
          list="epiton-wizard-suggestions"
          style={{ minWidth: "16rem" }}
        />
        <datalist id="epiton-wizard-suggestions">
          {DEFAULT_WIZARDS.map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
        <Button variant="primary" onClick={() => void start()}>
          Start
        </Button>
        <Button disabled={!runtime} onClick={() => void deleteSession()}>
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
              onChange: (name, value) => handleFieldChange(name, value),
            })
          : null}
        {runtime?.buttons.length ? (
          <div className="epiton-toolbar" style={{ marginTop: "0.75rem" }}>
            {runtime.buttons.map((b) => (
              <Button
                key={`${b.state}:${b.string ?? ""}`}
                variant={b.default ? "primary" : "default"}
                onClick={() => void transitionTo(b.state, b)}
              >
                {b.string ?? b.state}
              </Button>
            ))}
          </div>
        ) : null}
      </StateBlock>
    </Panel>
  );
}
