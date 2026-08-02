import { describe, expect, it } from "vitest";
import { parseCalendarArch, rowsToCalendarEvents } from "./calendar";
import {
  formatTrytonDate,
  formatTrytonTime,
  parseTrytonDateInput,
  parseTrytonTimeInput,
} from "./dates";
import { inferGraphFields, rowsToGraphData } from "./graph";
import { parseXml } from "./parse";
import { evalPyson, resolveStatesAttr } from "./pyson";

describe("pyson subset", () => {
  it("evaluates Eval and Not(Eval)", () => {
    expect(evalPyson("Eval('active')", { active: true })).toBe(true);
    expect(evalPyson("Not(Eval('active'))", { active: true })).toBe(false);
    expect(evalPyson("True", {})).toBe(true);
  });

  it("resolves states attrs", () => {
    const states = resolveStatesAttr(
      "{'invisible': Not(Eval('active')), 'readonly': Eval('locked')}",
      { active: false, locked: true },
    );
    expect(states.invisible).toBe(true);
    expect(states.readonly).toBe(true);
  });
});

describe("calendar/graph helpers", () => {
  it("maps rows to events", () => {
    const events = rowsToCalendarEvents([
      { id: 1, name: "Visit", start: "2026-07-01T10:00:00", end: "2026-07-01T11:00:00" },
    ]);
    expect(events[0]?.title).toBe("Visit");
    expect(events[0]?.start).toContain("2026-07-01");
  });

  it("uses the display label of hydrated Many2One calendar values", () => {
    const events = rowsToCalendarEvents(
      [
        {
          id: 2,
          patient: [9, "Paciente Sintético"],
          appointment_date: "2026-07-01T12:00:00",
        },
      ],
      { startField: "appointment_date", titleField: "patient" },
    );

    expect(events[0]?.title).toBe("Paciente Sintético");
  });

  it("parses calendar arch fields", () => {
    const root = parseXml(
      `<calendar dtstart="appointment_date" dtend="end_date" color="employee"><field name="name"/></calendar>`,
    );
    expect(parseCalendarArch(root)).toEqual({
      dtstart: "appointment_date",
      dtend: "end_date",
      color: "employee",
      titleField: "name",
      mode: undefined,
    });
  });

  it("infers graph fields and limits rows", () => {
    const { xField, yField } = inferGraphFields(["name", "amount", "id"]);
    expect(xField).toBe("name");
    expect(yField).toBe("amount");
    const data = rowsToGraphData([{ id: 1, name: "A", amount: 3 }], xField, yField);
    expect(data[0]).toEqual({ x: "A", y: 3 });
  });
});

describe("dates", () => {
  it("formats legacy date strings for inputs", () => {
    expect(formatTrytonDate("2026-07-01")).toBe("2026-07-01");
  });

  it("formats Tryton 8 typed temporal values for HTML inputs", () => {
    expect(formatTrytonDate({ __class__: "date", year: 2026, month: 8, day: 2 })).toBe(
      "2026-08-02",
    );
    expect(
      formatTrytonDate(
        {
          __class__: "datetime",
          year: 2026,
          month: 8,
          day: 2,
          hour: 9,
          minute: 7,
          second: 31,
          microsecond: 456000,
        },
        true,
      ),
    ).toBe("2026-08-02T09:07");
  });

  it("encodes HTML input values as Tryton 8 typed temporal values", () => {
    expect(parseTrytonDateInput("2026-08-02")).toEqual({
      __class__: "date",
      year: 2026,
      month: 8,
      day: 2,
    });
    expect(parseTrytonDateInput("2026-08-02T09:07", true)).toEqual({
      __class__: "datetime",
      year: 2026,
      month: 8,
      day: 2,
      hour: 9,
      minute: 7,
      second: 0,
      microsecond: 0,
    });
  });

  it("rejects invalid typed dates instead of sending malformed RPC values", () => {
    expect(parseTrytonDateInput("2026-02-30")).toBeNull();
    expect(formatTrytonDate({ __class__: "date", year: 2026, month: 2, day: 30 })).toBe("");
  });

  it("edits split date/time widgets without discarding the other datetime component", () => {
    const appointment = {
      __class__: "datetime" as const,
      year: 2026,
      month: 8,
      day: 2,
      hour: 9,
      minute: 7,
      second: 31,
      microsecond: 456000,
    };

    expect(formatTrytonTime(appointment)).toBe("09:07");
    expect(parseTrytonDateInput("2026-08-03", false, appointment)).toEqual({
      ...appointment,
      day: 3,
    });
    expect(parseTrytonTimeInput("10:45", appointment)).toEqual({
      ...appointment,
      hour: 10,
      minute: 45,
      second: 0,
      microsecond: 0,
    });
  });
});
