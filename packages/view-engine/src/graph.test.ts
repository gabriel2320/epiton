import { describe, expect, it } from "vitest";
import { labelFieldCandidate, numericFieldCandidates, summarizeSeries } from "./analytics";
import {
  aggregateGraphData,
  inferGraphFields,
  parseGraphArch,
  rowsToGraphData,
  rowsToMultiSeries,
} from "./graph";
import { parseXml } from "./parse";

describe("graph", () => {
  it("parses Tryton graph arch", () => {
    const root = parseXml(
      `<graph type="pie" string="By state"><x><field name="state"/></x><y><field name="amount"/><field name="qty"/></y></graph>`,
    );
    expect(parseGraphArch(root)).toEqual({
      type: "pie",
      xFields: ["state"],
      yFields: ["amount", "qty"],
      yOperators: ["sum", "sum"],
      string: "By state",
    });
  });

  it("parses y field operators", () => {
    const root = parseXml(
      `<graph type="vbar"><x><field name="state"/></x><y><field name="amount" operator="average"/><field name="id" operator="count"/></y></graph>`,
    );
    expect(parseGraphArch(root)).toEqual({
      type: "vbar",
      xFields: ["state"],
      yFields: ["amount", "id"],
      yOperators: ["average", "count"],
      string: undefined,
    });
  });

  it("aggregates and summarizes series", () => {
    const rows = [
      { name: "A", amount: 10 },
      { name: "A", amount: 5 },
      { name: "B", amount: 3 },
    ];
    const data = aggregateGraphData(rows, "name", "amount");
    expect(data).toEqual([
      { x: "A", y: 15 },
      { x: "B", y: 3 },
    ]);
    expect(aggregateGraphData(rows, "name", "amount", "average")).toEqual([
      { x: "A", y: 7.5 },
      { x: "B", y: 3 },
    ]);
    expect(aggregateGraphData(rows, "name", "amount", "count")).toEqual([
      { x: "A", y: 2 },
      { x: "B", y: 1 },
    ]);
    const insight = summarizeSeries(data);
    expect(insight.sum).toBe(18);
    expect(insight.top[0]?.x).toBe("A");
  });

  it("builds multi-series rows", () => {
    const rows = rowsToMultiSeries([{ name: "X", a: 1, b: 2 }], "name", ["a", "b"]);
    expect(rows[0]).toEqual({ x: "X", a: 1, b: 2 });
  });

  it("infers fields and maps rows", () => {
    expect(inferGraphFields(["name", "amount"])).toEqual({ xField: "name", yField: "amount" });
    expect(rowsToGraphData([{ name: "Z", amount: 9 }], "name", "amount")).toEqual([
      { x: "Z", y: 9 },
    ]);
  });

  it("detects numeric/label candidates", () => {
    const rows = [{ id: 1, rec_name: "P", total: 12, active: true }];
    expect(numericFieldCandidates(rows)).toEqual(["total"]);
    expect(labelFieldCandidate(rows)).toBe("rec_name");
  });
});
