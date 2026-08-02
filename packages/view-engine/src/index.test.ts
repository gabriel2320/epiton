import { describe, expect, it } from "vitest";
import {
  parseFieldsViewGet,
  parseViewLayoutAttributes,
  parseXml,
  treeButtons,
  treeColumns,
  treeEditable,
  treeEditablePlacement,
} from "./index";

describe("view-engine", () => {
  it("parses tree arch and fields", () => {
    const parsed = parseFieldsViewGet({
      arch: `<tree><field name="name"/><field name="code"/><button name="activate" string="Activate" confirm="Sure?"/></tree>`,
      fields: {
        name: { type: "char", string: "Name" },
        code: { type: "char", string: "Code", readonly: true },
      },
    });
    expect(parsed.type).toBe("tree");
    expect(parsed.fields.name?.type).toBe("char");
    expect(parsed.buttons[0]?.name).toBe("activate");
    expect(treeColumns(parsed).map((c) => c.name)).toEqual(["name", "code"]);
    expect(treeButtons(parsed)).toEqual([
      { name: "activate", string: "Activate", type: undefined, confirm: "Sure?" },
    ]);
    expect(treeEditable(parsed)).toBe(false);
  });

  it("parses tree sum/average aggregates", () => {
    const parsed = parseFieldsViewGet({
      arch: `<tree><field name="name"/><field name="amount" sum="1"/><field name="qty" average="1"/></tree>`,
      fields: {
        name: { type: "char", string: "Name" },
        amount: { type: "numeric", string: "Amount" },
        qty: { type: "float", string: "Qty" },
      },
    });
    const cols = treeColumns(parsed);
    expect(cols.find((c) => c.name === "amount")?.aggregate).toBe("sum");
    expect(cols.find((c) => c.name === "qty")?.aggregate).toBe("average");
  });

  it("keeps repeated fields as distinct columns with their XML widgets", () => {
    const parsed = parseFieldsViewGet({
      arch: `<tree><field name="appointment_date" widget="date"/><field name="appointment_date" widget="time"/></tree>`,
      fields: {
        appointment_date: { type: "datetime", string: "Appointment date" },
      },
    });

    expect(treeColumns(parsed)).toMatchObject([
      { key: "appointment_date:0", name: "appointment_date", widget: "date" },
      { key: "appointment_date:1", name: "appointment_date", widget: "time" },
    ]);
  });

  it("parses form with o2m/m2o", () => {
    const parsed = parseFieldsViewGet({
      arch: `<form><group string="Main"><field name="party"/><field name="lines"/></group></form>`,
      fields: {
        party: { type: "many2one", relation: "party.party", string: "Party" },
        lines: { type: "one2many", relation: "sale.line", string: "Lines" },
      },
    });
    expect(parsed.fields.party?.relation).toBe("party.party");
    expect(parsed.fields.lines?.type).toBe("one2many");
  });

  it("normalizes dense form layout attributes without losing the XML contract", () => {
    const parsed = parseFieldsViewGet({
      arch: '<form col="6"><group colspan="6" xexpand="1"><field name="name" colspan="4" xfill="0" xalign="1"/><hpaned position="280"/></group></form>',
      fields: { name: { type: "char", string: "Name" } },
    });

    expect(parseViewLayoutAttributes(parsed.arch.attrs)).toMatchObject({ columns: 6 });
    const group = parsed.arch.children[0]!;
    expect(group.attrs).toMatchObject({ colspan: "6", xexpand: "1" });
    expect(parseViewLayoutAttributes(group.attrs)).toMatchObject({
      colspan: 6,
      xexpand: true,
    });
    expect(parseViewLayoutAttributes(group.children[0]!.attrs)).toMatchObject({
      colspan: 4,
      xfill: false,
      xalign: 1,
    });
    expect(parseViewLayoutAttributes(group.children[1]!.attrs).position).toBe(280);
  });

  it("bounds malformed layout values and supports unconstrained containers", () => {
    expect(
      parseViewLayoutAttributes({
        col: "0",
        colspan: "nope",
        rowspan: "-3",
        xexpand: "false",
        yexpand: "yes",
        xfill: "0",
        xalign: "9",
        yalign: "-2",
        position: "-10",
      }),
    ).toEqual({
      columns: null,
      colspan: 1,
      rowspan: 1,
      xexpand: false,
      yexpand: true,
      xfill: false,
      yfill: true,
      xalign: 1,
      yalign: 0,
      position: null,
    });
    expect(parseViewLayoutAttributes({ col: "0.5" }).columns).toBe(1);
  });

  it("parses on_change and domain metadata", () => {
    const parsed = parseFieldsViewGet({
      arch: `<form><field name="party"/></form>`,
      fields: {
        party: {
          type: "many2one",
          relation: "party.party",
          on_change: ["party"],
          on_change_with: ["company"],
          domain: [["active", "=", true]],
        },
      },
    });
    expect(parsed.fields.party?.on_change).toEqual(["party"]);
    expect(parsed.fields.party?.on_change_with).toEqual(["company"]);
    expect(parsed.fields.party?.domain).toEqual([["active", "=", true]]);
  });

  it("parses embedded relation create, delete and pre_validate policy", () => {
    const parsed = parseFieldsViewGet({
      arch: '<form><field name="lines" create="0" delete="1" pre_validate="1"/></form>',
      fields: {
        lines: { type: "one2many", relation: "sale.line", string: "Lines" },
      },
    });

    expect(parsed.fields.lines).toMatchObject({
      create: false,
      delete: true,
      pre_validate: true,
    });
  });

  it("applies arch widget= overrides to field type", () => {
    const parsed = parseFieldsViewGet({
      arch: `<form><field name="website" widget="url"/><note string="Hint"/></form>`,
      fields: {
        website: { type: "char", string: "Website" },
      },
    });
    expect(parsed.fields.website?.widget).toBe("url");
    expect(parsed.fields.website?.type).toBe("url");
  });

  it("rejects empty xml", () => {
    expect(() => parseXml("")).toThrow();
  });

  it("parses Sao wizard execute payloads", async () => {
    const { parseWizardPayload } = await import("./index");
    const parsed = parseWizardPayload({
      view: {
        state: "start",
        fields_view: {
          arch: `<form><field name="module"/></form>`,
          fields: { module: { type: "char", string: "Module" } },
        },
        defaults: { module: "party" },
        values: { module: "company" },
        buttons: [
          { state: "end", string: "Cancel", default: false },
          { state: "upgrade", string: "Start Upgrade", default: true },
        ],
      },
    });
    expect(parsed.ended).toBe(false);
    expect(parsed.state).toBe("start");
    expect(parsed.view?.fields.module?.type).toBe("char");
    expect(parsed.defaults?.module).toBe("party");
    expect(parsed.values?.module).toBe("company");
    expect(parsed.buttons.map((b) => b.state)).toEqual(["end", "upgrade"]);
  });
});
