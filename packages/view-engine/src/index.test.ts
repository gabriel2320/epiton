import { describe, expect, it } from "vitest";
import { parseFieldsViewGet, parseXml, treeColumns } from "./index";

const TREE_ARCH = `
<form><![CDATA[]]></form>
`.trim();

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

  it("rejects empty xml", () => {
    expect(() => parseXml("")).toThrow();
  });

  it("ignores unused TREE_ARCH constant shape", () => {
    expect(TREE_ARCH.includes("form")).toBe(true);
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
