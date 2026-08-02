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
  type ViewField,
  type WizardButton,
  parseWizardPayload,
  renderView,
} from "@epiton/view-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../lib/store";
import { RelationSearch } from "./RelationSearch";

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

function wizardContext(
  initialContext: JsonObject | null | undefined,
  activeId: number | null | undefined,
  activeIds: number[] | undefined,
  activeModel: string | null | undefined,
  actionId: number | null | undefined,
): JsonObject {
  const context: JsonObject = { ...(initialContext ?? {}) };
  if (activeId != null) context.active_id = activeId;
  if (activeIds?.length) context.active_ids = activeIds;
  else if (activeId != null) context.active_ids = [activeId];
  if (activeModel) context.active_model = activeModel;
  if (actionId != null) context.action_id = actionId;
  return context;
}

/** Sao-compatible wizard stepper: create → execute(state) → button transitions → delete. */
export function WizardStepper(props: {
  initialWizard?: string | null;
  /** Invocation context from an action host such as a board pane. */
  initialContext?: JsonObject | null;
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
  const [wizardName, setWizardName] = useState(props.initialWizard ?? "");
  const [runtime, setRuntime] = useState<WizardRuntime | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "data">("idle");
  const [message, setMessage] = useState("Pick a wizard and start");
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [relationDomain, setRelationDomain] = useState<unknown[] | undefined>(undefined);
  const onActionsRef = useRef(props.onActions);
  onActionsRef.current = props.onActions;
  const runtimeRef = useRef<WizardRuntime | null>(null);
  runtimeRef.current = runtime;
  const onChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invocationContext = useMemo(
    () =>
      wizardContext(
        props.initialContext,
        props.activeId,
        props.activeIds,
        props.activeModel,
        props.actionId,
      ),
    [props.initialContext, props.activeId, props.activeIds, props.activeModel, props.actionId],
  );

  function buildContext(): JsonObject {
    return { ...invocationContext };
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
    if (!name.trim()) {
      setStatus("error");
      setMessage("Choose a wizard supplied by a backend action or enter its technical name");
      return;
    }
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
        const context = { ...invocationContext };
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
  }, [props.autoStart, props.initialWizard, invocationContext, client]);

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
          placeholder="wizard technical name"
          style={{ minWidth: "16rem" }}
        />
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
              onOpenRelation: (field, _value, domain) => {
                if (field.type === "many2one") {
                  setRelationField(field);
                  setRelationDomain(domain);
                }
              },
            })
          : null}
        {relationField?.type === "many2one" && runtime ? (
          <RelationSearch
            field={relationField}
            recordValues={runtime.values}
            domain={relationDomain}
            context={runtime.context}
            mode="write"
            onCancel={() => {
              setRelationField(null);
              setRelationDomain(undefined);
            }}
            onPick={(id, recName) => {
              handleFieldChange(relationField.name, [id, recName]);
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : null}
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
