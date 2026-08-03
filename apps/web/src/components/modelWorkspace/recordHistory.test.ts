import type { JsonObject, JsonValue } from "@epiton/protocol";
import { describe, expect, it, vi } from "vitest";
import {
  type RecordHistoryClient,
  formatHistoryMoment,
  listRecordHistory,
  readRecordHistorySnapshot,
} from "./recordHistory";

const moment: JsonObject = {
  __class__: "datetime",
  year: 2026,
  month: 8,
  day: 2,
  hour: 9,
  minute: 7,
  second: 5,
  microsecond: 123456,
};

function clientReturning(...results: JsonValue[]) {
  const model = vi.fn<RecordHistoryClient["model"]>();
  for (const result of results) model.mockResolvedValueOnce(result);
  return { client: { model }, model };
}

describe("native Tryton record history", () => {
  it("lists model revisions without treating the history table as an RPC model", async () => {
    const { client, model } = clientReturning([[moment, 42, "Médica Epiton"]]);

    await expect(
      listRecordHistory(client, "gnuhealth.patient", 42, { company: 3 }),
    ).resolves.toEqual([
      expect.objectContaining({ at: moment, recordId: 42, user: "Médica Epiton" }),
    ]);
    expect(model).toHaveBeenCalledWith("gnuhealth.patient", "history_revisions", [[42]], {
      company: 3,
    });
  });

  it("passes the exact server datetime back in the temporal read context", async () => {
    const { client, model } = clientReturning([{ id: 42, general_info: "Anterior" }]);
    const revision = {
      at: moment,
      key: "revision-1",
      recordId: 42,
      user: "Médica Epiton",
    };

    await expect(
      readRecordHistorySnapshot(
        client,
        "gnuhealth.patient",
        revision,
        ["general_info", "general_info", "_timestamp"],
        { company: 3, language: "es" },
      ),
    ).resolves.toEqual({ id: 42, general_info: "Anterior" });
    expect(model).toHaveBeenCalledWith(
      "gnuhealth.patient",
      "read",
      [[42], ["id", "general_info"]],
      { company: 3, language: "es", _datetime: moment },
    );
  });

  it("coalesces concurrent history reads without caching clinical snapshots", async () => {
    let resolveRead: ((value: JsonValue) => void) | undefined;
    const model = vi.fn<RecordHistoryClient["model"]>(
      () =>
        new Promise<JsonValue>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const client = { model };
    const revision = {
      at: moment,
      key: "revision-1",
      recordId: 42,
      user: "Médica Epiton",
    };

    const first = readRecordHistorySnapshot(
      client,
      "gnuhealth.patient",
      revision,
      ["general_info"],
      { company: 3 },
    );
    const replay = readRecordHistorySnapshot(
      client,
      "gnuhealth.patient",
      revision,
      ["general_info"],
      { company: 3 },
    );

    expect(model).toHaveBeenCalledTimes(1);
    resolveRead?.([{ id: 42, general_info: "Antecedente clínico sintético" }]);
    await expect(Promise.all([first, replay])).resolves.toEqual([
      { id: 42, general_info: "Antecedente clínico sintético" },
      { id: 42, general_info: "Antecedente clínico sintético" },
    ]);

    model.mockResolvedValueOnce([{ id: 42, general_info: "Nueva lectura" }]);
    await expect(
      readRecordHistorySnapshot(client, "gnuhealth.patient", revision, ["general_info"], {
        company: 3,
      }),
    ).resolves.toEqual({ id: 42, general_info: "Nueva lectura" });
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent revision lists produced by replayed effects", async () => {
    let resolveList: ((value: JsonValue) => void) | undefined;
    const model = vi.fn<RecordHistoryClient["model"]>(
      () =>
        new Promise<JsonValue>((resolve) => {
          resolveList = resolve;
        }),
    );
    const client = { model };

    const first = listRecordHistory(client, "gnuhealth.patient", 42, { company: 3 });
    const replay = listRecordHistory(client, "gnuhealth.patient", 42, { company: 3 });

    expect(model).toHaveBeenCalledTimes(1);
    resolveList?.([[moment, 42, "Médica Epiton"]]);
    await expect(Promise.all([first, replay])).resolves.toHaveLength(2);
  });

  it("rejects malformed revision and historical read responses", async () => {
    const malformedList = clientReturning([["", 42, "User"]]).client;
    await expect(listRecordHistory(malformedList, "gnuhealth.patient", 42, {})).rejects.toThrow(
      "invalid revision",
    );

    const malformedRead = clientReturning([]).client;
    await expect(
      readRecordHistorySnapshot(
        malformedRead,
        "gnuhealth.patient",
        { at: moment, key: "x", recordId: 42, user: "User" },
        ["name"],
        {},
      ),
    ).rejects.toThrow("expected one record");
  });

  it("formats Tryton's extended datetime without changing its timezone", () => {
    expect(formatHistoryMoment(moment)).toBe("2026-08-02 09:07:05");
  });
});
