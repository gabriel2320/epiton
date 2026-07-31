import { describe, expect, it } from "vitest";
import { parseFieldsViewGet } from "./parse";
import { flattenTreeRows, mergeTreeRows, treeMeta } from "./tree_hierarchy";

describe("tree_hierarchy", () => {
  it("detects parent field and field_childs", () => {
    const view = parseFieldsViewGet({
      arch: `<tree sequence="sequence" keyword_open="1"><field name="name"/><field name="parent"/></tree>`,
      fields: {
        name: { type: "char", string: "Name" },
        parent: { type: "many2one", string: "Parent", relation: "account.account" },
        sequence: { type: "integer", string: "Sequence" },
        childs: { type: "one2many", string: "Children" },
      },
      field_childs: "childs",
    });
    const meta = treeMeta(view, "account.account");
    expect(meta.parentField).toBe("parent");
    expect(meta.childField).toBe("childs");
    expect(meta.sequenceField).toBe("sequence");
    expect(meta.keywordOpen).toBe(true);
    expect(meta.hierarchical).toBe(true);
  });

  it("flattens expanded children with depth", () => {
    const rows = [
      { id: 1, name: "Root", parent: null, sequence: 10 },
      { id: 2, name: "Child", parent: [1, "Root"], sequence: 5 },
      { id: 3, name: "Other", parent: null, sequence: 1 },
    ];
    const meta = {
      parentField: "parent",
      childField: null,
      sequenceField: "sequence",
      keywordOpen: false,
      hierarchical: true,
    };
    const collapsed = flattenTreeRows(rows, meta, new Set());
    expect(collapsed.map((r) => r.row.id)).toEqual([3, 1]);
    expect(collapsed.every((r) => r.depth === 0)).toBe(true);
    expect(collapsed.find((r) => r.row.id === 1)?.hasChildren).toBe(true);

    const expanded = flattenTreeRows(rows, meta, new Set([1]));
    expect(expanded.map((r) => [r.row.id, r.depth])).toEqual([
      [3, 0],
      [1, 0],
      [2, 1],
    ]);
  });

  it("marks hasChildren from field_childs hint before lazy load", () => {
    const rows = [{ id: 1, name: "Root", parent: null, childs: [2, 3] }];
    const meta = {
      parentField: "parent",
      childField: "childs",
      sequenceField: null,
      keywordOpen: false,
      hierarchical: true,
    };
    const flat = flattenTreeRows(rows, meta, new Set());
    expect(flat[0]?.hasChildren).toBe(true);
  });

  it("merges lazy child rows by id", () => {
    const merged = mergeTreeRows(
      [{ id: 1, name: "A" }],
      [
        { id: 2, name: "B" },
        { id: 1, name: "A2" },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === 1)?.name).toBe("A2");
  });
});
