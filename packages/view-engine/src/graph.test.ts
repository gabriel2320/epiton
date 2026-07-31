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
      string: "By state",
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
