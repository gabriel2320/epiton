import { describe, expect, it } from "vitest";
import { rowsToCalendarEvents } from "./calendar";
import { formatTrytonDate } from "./dates";
import { inferGraphFields, rowsToGraphData } from "./graph";
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

  it("infers graph fields and limits rows", () => {
    const { xField, yField } = inferGraphFields(["name", "amount", "id"]);
    expect(xField).toBe("name");
    expect(yField).toBe("amount");
    const data = rowsToGraphData([{ id: 1, name: "A", amount: 3 }], xField, yField);
    expect(data[0]).toEqual({ x: "A", y: 3 });
  });
});

describe("dates", () => {
  it("formats tryton dates for inputs", () => {
    expect(formatTrytonDate("2026-07-01")).toBe("2026-07-01");
  });
});
