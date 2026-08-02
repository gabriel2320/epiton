import { type JsonObject, applyFieldChange, preValidateRecord } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type ChildScreenExitDecision,
  type ChildScreenState,
  type ChildScreenTarget,
  type ParsedView,
  type RecordValues,
  type RelationCommandQueue,
  type ViewField,
  acceptChildScreenOnChange,
  applyChildScreenTrytonOnChange,
  beginChildScreenOnChange,
  cancelChildScreen,
  childScreenExitDecision,
  commitChildScreen,
  createChildScreen,
  createRelationQueue,
  hydrateChildScreen,
  parseFieldsViewGet,
  relationQueueOnChangeValue,
  renderView,
  screenTrytonTimestamps,
  screenValuesForOnChange,
  setChildScreenRelationQueue,
  updateChildScreenValues,
  validateChildScreen,
  withTrytonTimestampContext,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { backendRpcContextKey } from "../lib/backendTruth";
import { useAppStore } from "../lib/store";
import { RelationLinesEditor } from "./RelationLinesEditor";
import { RelationSearch } from "./RelationSearch";
import { beginButtonFlight, finishButtonFlight } from "./modelWorkspace/buttonFlight";

interface ChildOnChangeWork {
  promise: Promise<{ failed: boolean; error?: unknown }>;
  start: () => void;
  cancel: () => void;
}

function queuedCreateValues(
  target: ChildScreenTarget,
  queue: RelationCommandQueue,
): RecordValues | undefined {
  if (target.kind !== "queued-create") return undefined;
  const command = queue.commands[target.commandIndex];
  return command?.op === "create" ? (command.values as RecordValues) : {};
}

/** Embedded relation form. Accepting it only updates the parent-owned queue. */
export function RelationLineForm(props: {
  model: string;
  target: ChildScreenTarget;
  parentQueue: RelationCommandQueue;
  context?: JsonObject;
  preValidate?: boolean;
  onCancel: () => void;
  onCommit: (queue: RelationCommandQueue) => void;
  onOpenRelated?: (model: string, id: number) => void;
  onExitDecisionChange?: (decision: ChildScreenExitDecision) => void;
}) {
  const { t } = useTranslation();
  const client = useAppStore((state) => state.client);
  const density = useAppStore((state) => state.density);
  const sessionContext = useAppStore((state) => state.sessionContext);
  const rpcContext: JsonObject = useMemo(
    () => ({ ...sessionContext, ...(props.context ?? {}) }),
    [sessionContext, props.context],
  );
  const rpcScope = backendRpcContextKey(rpcContext);
  const [child, setChild] = useState<ChildScreenState>(() =>
    createChildScreen(
      props.model,
      props.target,
      queuedCreateValues(props.target, props.parentQueue),
    ),
  );
  const childRef = useRef(child);
  const workRef = useRef<ChildOnChangeWork | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [relationField, setRelationField] = useState<ViewField | null>(null);
  const [relationDomain, setRelationDomain] = useState<unknown[] | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [onChangePending, setOnChangePending] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [buttonFlight, setButtonFlight] = useState<string | null>(null);
  const buttonFlightRef = useRef<string | null>(null);
  const [nestedExitDecision, setNestedExitDecision] = useState<ChildScreenExitDecision>({
    kind: "allow",
  });
  const editing = props.target.kind === "record";

  const publishChild = useCallback((next: ChildScreenState) => {
    childRef.current = next;
    setChild(next);
  }, []);

  const viewQuery = useQuery({
    queryKey: ["relation-line-form", props.model, "form", rpcScope],
    enabled: Boolean(client && props.model),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParsedView> => {
      if (!client) throw new Error(t("relationLine.noClient"));
      return parseFieldsViewGet(await client.fieldsViewGet(props.model, null, "form", rpcContext));
    },
  });

  const recordQuery = useQuery({
    queryKey: [
      "relation-line-form",
      props.model,
      props.target.kind === "record" ? props.target.id : null,
      viewQuery.dataUpdatedAt,
      rpcScope,
    ],
    enabled: Boolean(client && editing && viewQuery.data),
    queryFn: async (): Promise<RecordValues> => {
      if (!client || props.target.kind !== "record") {
        throw new Error(t("relationLine.noRecord"));
      }
      const fields = [
        ...new Set(["id", "_timestamp", ...Object.keys(viewQuery.data?.fields ?? {})]),
      ];
      const rows = await client.searchRead(
        props.model,
        [["id", "=", props.target.id]],
        fields,
        0,
        1,
        null,
        rpcContext,
      );
      const row = rows[0];
      if (!row) {
        throw new Error(t("relationLine.notFound", { model: props.model, id: props.target.id }));
      }
      return row as RecordValues;
    },
  });

  const defaultsQuery = useQuery({
    queryKey: [
      "relation-line-form",
      props.model,
      "defaults",
      Object.keys(viewQuery.data?.fields ?? {}).join(","),
      rpcScope,
    ],
    enabled: Boolean(client && props.target.kind === "new" && viewQuery.data),
    queryFn: async (): Promise<RecordValues> => {
      if (!client) throw new Error(t("relationLine.noClient"));
      const fields = Object.keys(viewQuery.data?.fields ?? {});
      const result = await client.model(
        props.model,
        "default_get",
        [fields.length ? fields : ["name"]],
        rpcContext,
      );
      return result && typeof result === "object" && !Array.isArray(result)
        ? (result as RecordValues)
        : {};
    },
  });

  useEffect(() => {
    if (!recordQuery.data) return;
    const next = hydrateChildScreen(childRef.current, recordQuery.data);
    if (next !== childRef.current) publishChild(next);
  }, [recordQuery.data, publishChild]);

  useEffect(() => {
    if (!defaultsQuery.data) return;
    const next = hydrateChildScreen(childRef.current, defaultsQuery.data);
    if (next !== childRef.current) publishChild(next);
  }, [defaultsQuery.data, publishChild]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      workRef.current?.cancel();
      childRef.current = cancelChildScreen(childRef.current);
    },
    [],
  );

  const ownExitDecision = childScreenExitDecision(child);
  const requiresExitConfirmation =
    ownExitDecision.kind === "confirm-discard" || nestedExitDecision.kind === "confirm-discard";

  useEffect(() => {
    props.onExitDecisionChange?.(
      requiresExitConfirmation
        ? { kind: "confirm-discard", reason: "unsaved-child" }
        : { kind: "allow" },
    );
  }, [props.onExitDecisionChange, requiresExitConfirmation]);

  useEffect(
    () => () => props.onExitDecisionChange?.({ kind: "allow" }),
    [props.onExitDecisionChange],
  );

  const handleNestedExitDecision = useCallback((decision: ChildScreenExitDecision) => {
    setNestedExitDecision((current) => (current.kind === decision.kind ? current : decision));
  }, []);

  function scheduleOnChange(name: string) {
    if (!client || !viewQuery.data) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    workRef.current?.cancel();

    const started = beginChildScreenOnChange(childRef.current);
    publishChild(started.child);
    setOnChangePending(true);
    const values = screenValuesForOnChange(started.child.screen, viewQuery.data.fields);
    let didStart = false;
    let settled = false;
    let resolveWork: (result: { failed: boolean; error?: unknown }) => void = () => {};
    const promise = new Promise<{ failed: boolean; error?: unknown }>((resolve) => {
      resolveWork = resolve;
    });
    const settle = (result: { failed: boolean; error?: unknown }) => {
      if (settled) return;
      settled = true;
      resolveWork(result);
    };
    const start = () => {
      if (didStart || settled) return;
      didStart = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void (async () => {
        let error: unknown;
        try {
          const patch = await applyFieldChange(
            client,
            props.model,
            viewQuery.data.fields,
            values,
            name,
            rpcContext,
          );
          const current = childRef.current;
          const next = applyChildScreenTrytonOnChange(
            current,
            started.token,
            patch,
            viewQuery.data.fields,
          );
          if (next !== current) publishChild(next);
        } catch (caught) {
          if (acceptChildScreenOnChange(childRef.current, started.token)) {
            error = caught;
            setNoticeIsError(true);
            setNotice(caught instanceof Error ? caught.message : t("relationLine.onChangeFailed"));
          }
        } finally {
          if (workRef.current === work) {
            workRef.current = null;
            setOnChangePending(false);
          }
          settle({ failed: error != null, error });
        }
      })();
    };
    const cancel = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      settle({ failed: false });
    };
    const work: ChildOnChangeWork = { promise, start, cancel };
    workRef.current = work;
    timerRef.current = setTimeout(start, 250);
  }

  async function flushOnChange() {
    while (workRef.current) {
      const work = workRef.current;
      work.start();
      const result = await work.promise;
      if (result.failed) {
        throw result.error instanceof Error
          ? result.error
          : new Error(t("relationLine.onChangeFailed"));
      }
    }
  }

  function handleChange(name: string, value: unknown) {
    const current = childRef.current;
    publishChild(
      updateChildScreenValues(current, {
        ...current.screen.values,
        [name]: value,
      }),
    );
    scheduleOnChange(name);
  }

  function handleRelationQueueChange(
    field: ViewField,
    update: (current: RelationCommandQueue) => RelationCommandQueue,
  ) {
    const current = childRef.current;
    const kind = field.type === "many2many" ? "many2many" : "one2many";
    const queue =
      current.screen.relationQueues[field.name] ??
      createRelationQueue(kind, current.screen.values[field.name]);
    const nextQueue = update(queue);
    let next = setChildScreenRelationQueue(current, field.name, nextQueue);
    next = updateChildScreenValues(next, {
      ...next.screen.values,
      [field.name]: relationQueueOnChangeValue(nextQueue),
    });
    publishChild(next);
    scheduleOnChange(field.name);
  }

  function openRelation(field: ViewField, value: unknown, domain?: unknown[]) {
    if (
      relationField &&
      relationField.name !== field.name &&
      nestedExitDecision.kind === "confirm-discard"
    ) {
      if (
        typeof globalThis.confirm === "function" &&
        !globalThis.confirm(t("relationLine.discardConfirm"))
      ) {
        return;
      }
      setNestedExitDecision({ kind: "allow" });
    }
    if (field.type === "one2many" || field.type === "many2many") {
      const current = childRef.current;
      if (!current.screen.relationQueues[field.name]) {
        publishChild(
          setChildScreenRelationQueue(current, field.name, createRelationQueue(field.type, value)),
        );
      }
    }
    setRelationField(field);
    setRelationDomain(domain);
    if (
      field.type === "many2one" &&
      field.relation &&
      Array.isArray(value) &&
      typeof value[0] === "number" &&
      props.onOpenRelated
    ) {
      props.onOpenRelated(field.relation, value[0]);
    }
  }

  async function acceptChild() {
    if (!client || !viewQuery.data || committing) return;
    setCommitting(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      await flushOnChange();
      if (nestedExitDecision.kind === "confirm-discard") {
        setNoticeIsError(true);
        setNotice(t("relationLine.finishNested"));
        return;
      }
      const current = childRef.current;
      const issues = validateChildScreen(current, viewQuery.data.fields);
      if (issues.length) {
        setNoticeIsError(true);
        setNotice(
          t("relationLine.required", {
            fields: issues.map((issue) => issue.path.join(".")).join(", "),
          }),
        );
        return;
      }
      if (props.preValidate) {
        await preValidateRecord(
          client,
          props.model,
          screenValuesForOnChange(current.screen, viewQuery.data.fields),
          viewQuery.data.fields,
          rpcContext,
        );
      }
      const result = commitChildScreen(props.parentQueue, current, viewQuery.data.fields);
      if (!result.ok) {
        setNoticeIsError(true);
        setNotice(
          result.issues.length
            ? t("relationLine.invalid", {
                fields: result.issues.map((issue) => issue.path.join(".")).join(", "),
              })
            : t("relationLine.cannotQueue", { reason: result.reason }),
        );
        return;
      }
      props.onCommit(result.queue);
    } catch (error) {
      setNoticeIsError(true);
      setNotice(error instanceof Error ? error.message : t("relationLine.validationFailed"));
    } finally {
      setCommitting(false);
    }
  }

  function discardChild() {
    const current = childRef.current;
    if (
      (childScreenExitDecision(current).kind === "confirm-discard" ||
        nestedExitDecision.kind === "confirm-discard") &&
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(t("relationLine.discardConfirm"))
    ) {
      return;
    }
    workRef.current?.cancel();
    publishChild(cancelChildScreen(current));
    props.onCancel();
  }

  async function runButton(name: string, meta?: { type?: string }) {
    if (!client) return;
    if ((meta?.type ?? "").toLowerCase() === "action") {
      setNoticeIsError(false);
      setNotice(t("relationLine.actionFromParent", { name }));
      return;
    }
    if (props.target.kind !== "record") {
      setNoticeIsError(false);
      setNotice(t("relationLine.saveFirst"));
      return;
    }
    const flightKey = `${props.model}:${name}:${props.target.id}`;
    if (!beginButtonFlight(buttonFlightRef, flightKey)) return;
    setButtonFlight(flightKey);
    setNoticeIsError(false);
    setNotice(t("relationLine.running", { name }));
    try {
      await client.model(
        props.model,
        name,
        [[props.target.id]],
        withTrytonTimestampContext(
          {
            ...rpcContext,
            active_id: props.target.id,
            active_ids: [props.target.id],
            active_model: props.model,
          },
          screenTrytonTimestamps(childRef.current.screen),
        ) as JsonObject,
      );
      setNotice(t("relationLine.buttonOk", { name }));
      await recordQuery.refetch();
    } catch (error) {
      setNoticeIsError(true);
      setNotice(error instanceof Error ? error.message : t("relationLine.buttonFailed"));
    } finally {
      if (finishButtonFlight(buttonFlightRef, flightKey)) setButtonFlight(null);
    }
  }

  const state =
    viewQuery.isLoading ||
    (editing && recordQuery.isLoading) ||
    (props.target.kind === "new" && defaultsQuery.isLoading)
      ? "loading"
      : viewQuery.isError || recordQuery.isError || defaultsQuery.isError
        ? "error"
        : viewQuery.data && child.screen.hydrated
          ? "data"
          : "empty";
  const stateMessage =
    (viewQuery.error instanceof Error && viewQuery.error.message) ||
    (recordQuery.error instanceof Error && recordQuery.error.message) ||
    (defaultsQuery.error instanceof Error && defaultsQuery.error.message) ||
    t("relationLine.loading");
  const nestedLines = relationField?.type === "one2many" || relationField?.type === "many2many";
  const title =
    props.target.kind === "record"
      ? t("relationLine.editTitle", { model: props.model, id: props.target.id })
      : props.target.kind === "queued-create"
        ? t("relationLine.editQueuedTitle", { model: props.model })
        : t("relationLine.newTitle", { model: props.model });

  return (
    <Panel title={title}>
      <StateBlock state={state} message={stateMessage}>
        {viewQuery.data
          ? renderView(viewQuery.data, {
              values: child.screen.values,
              mode: "write",
              density,
              model: props.model,
              onChange: handleChange,
              onButton: (name, meta) => void runButton(name, meta),
              isButtonPending: () => buttonFlight !== null,
              onOpenRelation: openRelation,
            })
          : null}
        {relationField?.type === "many2one" ? (
          <RelationSearch
            field={relationField}
            recordValues={child.screen.values}
            domain={relationDomain}
            context={rpcContext}
            mode="write"
            onCancel={() => {
              setRelationField(null);
              setRelationDomain(undefined);
            }}
            onPick={(id, recName) => {
              handleChange(relationField.name, [id, recName]);
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : null}
        {nestedLines && relationField ? (
          <RelationLinesEditor
            field={relationField}
            value={child.screen.values[relationField.name]}
            mode="write"
            recordValues={child.screen.values}
            domain={relationDomain}
            context={rpcContext}
            queue={child.screen.relationQueues[relationField.name]}
            onQueueChange={(update) => handleRelationQueueChange(relationField, update)}
            onOpenLine={props.onOpenRelated}
            onExitDecisionChange={handleNestedExitDecision}
            onCommit={() => {
              setNestedExitDecision({ kind: "allow" });
              setRelationField(null);
              setRelationDomain(undefined);
            }}
          />
        ) : null}
        {onChangePending ? <p role="status">{t("relationLine.applyingOnChange")}</p> : null}
        {notice ? <p role={noticeIsError ? "alert" : "status"}>{notice}</p> : null}
        <div className="epiton-toolbar">
          <Button
            variant="primary"
            disabled={!viewQuery.data || !child.screen.hydrated || committing}
            onClick={() => void acceptChild()}
          >
            {props.target.kind === "record"
              ? t("relationLine.queueWrite")
              : t("relationLine.queueCreate")}
          </Button>
          <Button onClick={discardChild}>{t("relationLine.cancel")}</Button>
        </div>
      </StateBlock>
    </Panel>
  );
}
