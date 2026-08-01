import { type FieldOnChangeMeta, type JsonObject, applyFieldChange } from "@epiton/protocol";
import type { RecordValues } from "@epiton/view-engine";
import {
  type ScreenState,
  acceptLatestAsyncScreenUpdate,
  updateScreenValues,
} from "../../lib/screen";

type OnChangeClient = Parameters<typeof applyFieldChange>[0];

interface MutableCurrent<T> {
  current: T;
}

export interface OnChangeWorkResult {
  cancelled: boolean;
  failed: boolean;
  error?: unknown;
}

export interface OnChangeWork {
  promise: Promise<OnChangeWorkResult>;
  start: () => void;
  cancel: () => void;
}

export interface RecordLifecycleRefs {
  timer: MutableCurrent<ReturnType<typeof setTimeout> | null>;
  screen: MutableCurrent<ScreenState>;
  generation: MutableCurrent<number>;
  revision: MutableCurrent<number>;
  work: MutableCurrent<OnChangeWork | null>;
}

interface RecordLifecycleCallbacks {
  setScreen: (screen: ScreenState) => void;
  setPending: (pending: boolean) => void;
  setNotice: (notice: string) => void;
  onHistory?: (action: string) => void;
}

export interface ScheduleOnChangeOptions extends RecordLifecycleCallbacks {
  client: OnChangeClient | null;
  mode: "read" | "write";
  model: string;
  fields: Record<string, FieldOnChangeMeta> | undefined;
  context: JsonObject;
  refs: RecordLifecycleRefs;
  name: string;
  nextDraft: RecordValues;
  debounceMs?: number;
}

export interface HandleFieldChangeOptions
  extends Omit<ScheduleOnChangeOptions, "name" | "nextDraft"> {
  name: string;
  value: unknown;
}

export function replaceDraft(
  refs: RecordLifecycleRefs,
  setScreen: (screen: ScreenState) => void,
  values: RecordValues,
): ScreenState {
  const next = updateScreenValues(refs.screen.current, values);
  refs.screen.current = next;
  setScreen(next);
  return next;
}

export function invalidateOnChangeWork(
  refs: RecordLifecycleRefs,
  setPending?: (pending: boolean) => void,
): void {
  refs.revision.current += 1;
  refs.work.current?.cancel();
  refs.work.current = null;
  if (refs.timer.current) {
    clearTimeout(refs.timer.current);
    refs.timer.current = null;
  }
  setPending?.(false);
}

export function bumpScreenGeneration(
  refs: RecordLifecycleRefs,
  setPending?: (pending: boolean) => void,
): void {
  refs.generation.current += 1;
  invalidateOnChangeWork(refs, setPending);
}

export function scheduleOnChange(options: ScheduleOnChangeOptions): OnChangeWork | null {
  const {
    client,
    mode,
    model,
    fields,
    context,
    refs,
    name,
    nextDraft,
    setScreen,
    setPending,
    setNotice,
    onHistory,
    debounceMs = 280,
  } = options;
  if (!client || mode !== "write" || !fields) return null;

  const revision = refs.revision.current + 1;
  refs.revision.current = revision;
  refs.work.current?.cancel();
  setPending(true);
  const expected = {
    generation: refs.generation.current,
    model,
    recordId: refs.screen.current.recordId,
    revision,
  };
  let started = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveWork: (result: OnChangeWorkResult) => void = () => {};
  const promise = new Promise<OnChangeWorkResult>((resolve) => {
    resolveWork = resolve;
  });
  const settle = (result: OnChangeWorkResult) => {
    if (settled) return;
    settled = true;
    resolveWork(result);
  };
  const isLatest = () => {
    const current = refs.screen.current;
    return acceptLatestAsyncScreenUpdate(expected, {
      generation: refs.generation.current,
      model: current.model,
      recordId: current.recordId,
      revision: refs.revision.current,
    });
  };
  const start = () => {
    if (started || settled) return;
    started = true;
    if (timer && refs.timer.current === timer) {
      clearTimeout(timer);
      refs.timer.current = null;
    }
    timer = null;
    void (async () => {
      let error: unknown;
      let failed = false;
      try {
        const patch = await applyFieldChange(client, model, fields, nextDraft, name, context);
        if (!isLatest()) return;
        if (Object.keys(patch).length > 0) {
          replaceDraft(refs, setScreen, { ...refs.screen.current.values, ...patch });
          onHistory?.(`on_change:${name}`);
        }
      } catch (err) {
        if (!isLatest()) return;
        failed = true;
        error = err;
        setNotice(err instanceof Error ? err.message : "on_change failed");
      } finally {
        const latest = isLatest();
        if (refs.work.current === work) {
          refs.work.current = null;
          if (latest) setPending(false);
        }
        settle({
          cancelled: !latest,
          failed: latest && failed,
          error: latest ? error : undefined,
        });
      }
    })();
  };
  const cancel = () => {
    if (timer && refs.timer.current === timer) {
      clearTimeout(timer);
      refs.timer.current = null;
    }
    timer = null;
    settle({ cancelled: true, failed: false });
  };
  const work: OnChangeWork = { promise, start, cancel };
  refs.work.current = work;
  timer = setTimeout(start, debounceMs);
  refs.timer.current = timer;
  return work;
}

export async function flushPendingOnChange(refs: RecordLifecycleRefs): Promise<void> {
  while (refs.work.current) {
    const work = refs.work.current;
    work.start();
    const result = await work.promise;
    if (result.failed) {
      throw result.error instanceof Error ? result.error : new Error("on_change failed");
    }
  }
}

export function handleFieldChange(options: HandleFieldChangeOptions): OnChangeWork | null {
  const nextDraft = {
    ...options.refs.screen.current.values,
    [options.name]: options.value,
  };
  replaceDraft(options.refs, options.setScreen, nextDraft);
  return scheduleOnChange({ ...options, nextDraft });
}
