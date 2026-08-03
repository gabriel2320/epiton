import { describe, expect, it, vi } from "vitest";
import { createScreen } from "../../lib/screen";
import {
  bumpScreenGeneration,
  flushPendingOnChange,
  type HandleFieldChangeOptions,
  handleFieldChange,
  type RecordLifecycleRefs,
  type ScheduleOnChangeOptions,
} from "./recordLifecycle";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function lifecycleRefs(): RecordLifecycleRefs {
  return {
    timer: { current: null },
    screen: { current: createScreen("party.party", 7, { name: "Initial" }) },
    generation: { current: 0 },
    revision: { current: 0 },
    work: { current: null },
  };
}

function fieldChangeOptions(
  refs: RecordLifecycleRefs,
  client: NonNullable<ScheduleOnChangeOptions["client"]>,
): Omit<HandleFieldChangeOptions, "name" | "value"> & {
  pending: boolean[];
  history: string[];
} {
  const pending: boolean[] = [];
  const history: string[] = [];
  return {
    client,
    mode: "write",
    model: "party.party",
    fields: { name: { name: "name", on_change: ["name"] } },
    context: {},
    refs,
    debounceMs: 60_000,
    setScreen: vi.fn(),
    setPending: (value) => pending.push(value),
    setNotice: vi.fn(),
    onHistory: (action) => history.push(action),
    pending,
    history,
  };
}

describe("recordLifecycle", () => {
  it("keeps the latest overlapping on_change result for one record identity", async () => {
    const firstRpc = deferred<{ rec_name: string }>();
    const secondRpc = deferred<{ rec_name: string }>();
    let call = 0;
    const client: NonNullable<ScheduleOnChangeOptions["client"]> = {
      model: vi.fn(() => (call++ === 0 ? firstRpc.promise : secondRpc.promise)),
    };
    const refs = lifecycleRefs();
    const options = fieldChangeOptions(refs, client);

    const firstWork = handleFieldChange({ ...options, name: "name", value: "First" });
    expect(firstWork).not.toBeNull();
    firstWork?.start();

    const secondWork = handleFieldChange({ ...options, name: "name", value: "Second" });
    expect(secondWork).not.toBeNull();
    secondWork?.start();

    firstRpc.resolve({ rec_name: "Stale result" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refs.screen.current.values).toEqual({ name: "Second" });

    secondRpc.resolve({ rec_name: "Fresh result" });
    await secondWork?.promise;
    expect(refs.screen.current.values).toEqual({
      name: "Second",
      rec_name: "Fresh result",
    });
    expect(options.history).toEqual(["on_change:name"]);
    expect(options.pending).toEqual([true, true, false]);
  });

  it("flushes a debounced on_change before returning to save", async () => {
    const client: NonNullable<ScheduleOnChangeOptions["client"]> = {
      model: vi.fn(async () => ({ rec_name: "Flushed result" })),
    };
    const refs = lifecycleRefs();
    const options = fieldChangeOptions(refs, client);

    handleFieldChange({ ...options, name: "name", value: "Pending" });
    expect(refs.timer.current).not.toBeNull();

    await flushPendingOnChange(refs);

    expect(client.model).toHaveBeenCalledOnce();
    expect(refs.timer.current).toBeNull();
    expect(refs.work.current).toBeNull();
    expect(refs.screen.current.values).toEqual({
      name: "Pending",
      rec_name: "Flushed result",
    });
    expect(options.pending).toEqual([true, false]);
  });

  it("hydrates Tryton Many2One projections returned by on_change", async () => {
    const client: NonNullable<ScheduleOnChangeOptions["client"]> = {
      model: vi.fn(async () => ({
        party: 9,
        "party.": { id: 9, rec_name: "Paciente Sintético" },
      })),
    };
    const refs = lifecycleRefs();
    const options = fieldChangeOptions(refs, client);
    options.fields = {
      name: { name: "name", on_change: ["name"] },
      party: { name: "party", type: "many2one" },
    };

    const work = handleFieldChange({ ...options, name: "name", value: "Pending" });
    work?.start();
    await work?.promise;

    expect(refs.screen.current.values).toEqual({
      name: "Pending",
      party: [9, "Paciente Sintético"],
    });
  });

  it("bumps the Screen generation and cancels pending on_change work", async () => {
    const client: NonNullable<ScheduleOnChangeOptions["client"]> = {
      model: vi.fn(async () => ({ rec_name: "Must not apply" })),
    };
    const refs = lifecycleRefs();
    const options = fieldChangeOptions(refs, client);
    const work = handleFieldChange({ ...options, name: "name", value: "Abandoned" });

    bumpScreenGeneration(refs, options.setPending);

    await expect(work?.promise).resolves.toEqual({ cancelled: true, failed: false });
    expect(refs.generation.current).toBe(1);
    expect(refs.revision.current).toBe(2);
    expect(refs.timer.current).toBeNull();
    expect(refs.work.current).toBeNull();
    expect(client.model).not.toHaveBeenCalled();
    expect(options.pending).toEqual([true, false]);
  });
});
