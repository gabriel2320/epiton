import type { ReactNode } from "react";
import { createElement } from "react";
import { formatTrytonDate, parseTrytonDateInput } from "./dates";
import type { ParsedView, ViewField, ViewNode } from "./parse";
import { type WidgetRegistry, resolveFieldWidget } from "./plugins";
import { evalDomain, resolveStatesAttr } from "./pyson";

export type RecordValues = Record<string, unknown>;

export interface RenderContext {
  values: RecordValues;
  mode: "read" | "write";
  density: "compact" | "comfortable";
  model?: string;
  widgets?: WidgetRegistry;
  onChange?: (name: string, value: unknown) => void;
  onButton?: (name: string) => void;
  onOpenRelation?: (field: ViewField, value: unknown, domain?: unknown[]) => void;
  onBinaryDownload?: (field: ViewField, value: unknown) => void;
  renderField?: (field: ViewField, value: unknown) => ReactNode;
}

function fieldLabel(field: ViewField | undefined, fallback: string): string {
  return field?.string ?? fallback;
}

function renderInput(field: ViewField, value: unknown, ctx: RenderContext): ReactNode {
  if (ctx.renderField) return ctx.renderField(field, value);
  const plugin = resolveFieldWidget(ctx.widgets, field, ctx.model);
  if (plugin) return plugin(field, value);
  const disabled = ctx.mode === "read" || field.readonly;
  const common = {
    id: `epiton-field-${field.name}`,
    name: field.name,
    disabled,
    "aria-required": field.required || undefined,
  };

  if (field.type === "boolean") {
    return createElement("input", {
      ...common,
      type: "checkbox",
      checked: Boolean(value),
      onChange: (e: { target: { checked: boolean } }) =>
        ctx.onChange?.(field.name, e.target.checked),
    });
  }

  if (field.type === "selection" && field.selection) {
    return createElement(
      "select",
      {
        ...common,
        value: value == null ? "" : String(value),
        onChange: (e: { target: { value: string } }) => ctx.onChange?.(field.name, e.target.value),
      },
      field.selection.map(([k, label]) => createElement("option", { key: k, value: k }, label)),
    );
  }

  if (field.type === "text") {
    return createElement("textarea", {
      ...common,
      value: value == null ? "" : String(value),
      rows: ctx.density === "compact" ? 2 : 4,
      onChange: (e: { target: { value: string } }) => ctx.onChange?.(field.name, e.target.value),
    });
  }

  if (field.type === "binary") {
    const hasData = value != null && value !== "";
    return createElement(
      "div",
      { className: "epiton-binary" },
      createElement("span", null, hasData ? "Binary attached" : "No file"),
      createElement(
        "button",
        {
          type: "button",
          disabled: !hasData,
          onClick: () => {
            if (typeof value === "string" && value.startsWith("javascript:")) return;
            ctx.onBinaryDownload?.(field, value);
          },
        },
        "Download",
      ),
      ctx.mode === "write"
        ? createElement("input", {
            ...common,
            type: "file",
            onChange: (e: { target: { files: FileList | null } }) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result;
                if (typeof result === "string") {
                  const b64 = result.includes(",") ? result.split(",")[1] : result;
                  ctx.onChange?.(field.name, b64);
                }
              };
              reader.readAsDataURL(file);
            },
          })
        : null,
    );
  }

  if (field.type === "one2many" || field.type === "many2many") {
    const rows = Array.isArray(value) ? value : [];
    const domain = evalDomain(field.domain ?? [], ctx.values);
    return createElement(
      "div",
      { className: "epiton-o2m", "data-relation": field.relation ?? "" },
      createElement("div", { className: "epiton-o2m-count" }, `${rows.length} record(s)`),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => ctx.onOpenRelation?.(field, value, domain),
        },
        "Open lines",
      ),
    );
  }

  if (field.type === "many2one") {
    const display = Array.isArray(value) ? String(value[1] ?? value[0] ?? "") : String(value ?? "");
    const domain = evalDomain(field.domain ?? [], ctx.values);
    return createElement(
      "div",
      { className: "epiton-m2o" },
      createElement("input", {
        ...common,
        type: "text",
        value: display,
        readOnly: true,
      }),
      createElement(
        "button",
        {
          type: "button",
          disabled: ctx.mode === "read",
          onClick: () => ctx.onOpenRelation?.(field, value, domain),
        },
        "Search",
      ),
      createElement(
        "button",
        {
          type: "button",
          disabled: value == null,
          onClick: () => ctx.onOpenRelation?.(field, value, domain),
        },
        "Open",
      ),
    );
  }

  if (field.type === "date" || field.type === "datetime") {
    const withTime = field.type === "datetime";
    return createElement("input", {
      ...common,
      type: withTime ? "datetime-local" : "date",
      value: formatTrytonDate(value, withTime),
      onChange: (e: { target: { value: string } }) =>
        ctx.onChange?.(field.name, parseTrytonDateInput(e.target.value, withTime)),
    });
  }

  const inputType =
    field.type === "integer" || field.type === "float" || field.type === "numeric"
      ? "number"
      : "text";

  return createElement("input", {
    ...common,
    type: inputType,
    value: value == null ? "" : String(value),
    onChange: (e: { target: { value: string } }) => ctx.onChange?.(field.name, e.target.value),
  });
}

function renderNode(node: ViewNode, view: ParsedView, ctx: RenderContext): ReactNode {
  if (node.tag === "tree") {
    return createElement(
      "div",
      { className: `epiton-tree density-${ctx.density}` },
      node.children.map((c, i) => createElement("div", { key: i }, renderNode(c, view, ctx))),
    );
  }

  if (
    node.tag === "form" ||
    node.tag === "sheet" ||
    node.tag === "group" ||
    node.tag === "notebook" ||
    node.tag === "page"
  ) {
    return createElement(
      "section",
      {
        className: `epiton-${node.tag} density-${ctx.density}`,
        "data-string": node.attrs.string,
      },
      node.attrs.string
        ? createElement("h3", { className: "epiton-group-title" }, node.attrs.string)
        : null,
      node.children.map((c, i) => createElement("div", { key: i }, renderNode(c, view, ctx))),
    );
  }

  if (node.tag === "field") {
    const name = node.attrs.name ?? "";
    const field = view.fields[name] ?? {
      name,
      type: "char" as const,
      string: node.attrs.string ?? name,
    };
    const states = resolveStatesAttr(node.attrs.states, ctx.values);
    if (states.invisible) return null;
    const value = ctx.values[name];
    let domain = field.domain;
    if (node.attrs.domain) {
      try {
        domain = JSON.parse(node.attrs.domain.replace(/'/g, '"')) as unknown;
      } catch {
        domain = field.domain;
      }
    }
    const fieldWithFlags: ViewField = {
      ...field,
      domain,
      readonly: field.readonly || states.readonly,
      required: field.required || states.required,
    };
    return createElement(
      "label",
      { className: "epiton-field", htmlFor: `epiton-field-${name}` },
      createElement("span", { className: "epiton-field-label" }, fieldLabel(fieldWithFlags, name)),
      renderInput(fieldWithFlags, value, ctx),
      field.help ? createElement("small", { className: "epiton-field-help" }, field.help) : null,
    );
  }

  if (node.tag === "label") {
    return createElement(
      "div",
      { className: "epiton-label" },
      node.attrs.string ?? node.attrs.name ?? node.text ?? "",
    );
  }

  if (node.tag === "button") {
    const name = node.attrs.name ?? "";
    const states = resolveStatesAttr(node.attrs.states, ctx.values);
    if (states.invisible) return null;
    return createElement(
      "button",
      {
        type: "button",
        className: "epiton-button",
        "data-confirm": node.attrs.confirm,
        disabled: states.readonly === true,
        onClick: () => {
          if (node.attrs.confirm && typeof globalThis.confirm === "function") {
            if (!globalThis.confirm(node.attrs.confirm)) return;
          }
          ctx.onButton?.(name);
        },
      },
      node.attrs.string ?? name,
    );
  }

  if (node.tag === "calendar" || node.tag === "graph" || node.tag === "board") {
    return createElement(
      "div",
      { className: `epiton-${node.tag}-host`, role: "status" },
      `${node.tag} view — use workspace host renderer`,
      node.children.map((c, i) => createElement("div", { key: i }, renderNode(c, view, ctx))),
    );
  }

  if (node.tag === "newline" || node.tag === "separator") {
    return createElement("hr", { className: `epiton-${node.tag}` });
  }

  return createElement(
    "div",
    { className: `epiton-node-${node.tag}` },
    node.children.map((c, i) => createElement("div", { key: i }, renderNode(c, view, ctx))),
  );
}

export function renderView(view: ParsedView, ctx: RenderContext): ReactNode {
  return createElement(
    "div",
    { className: `epiton-view epiton-view-${view.type}`, "data-mode": ctx.mode },
    renderNode(view.arch, view, ctx),
    view.buttons.length
      ? createElement(
          "footer",
          { className: "epiton-view-actions" },
          view.buttons.map((b) =>
            createElement(
              "button",
              {
                key: b.name,
                type: "button",
                onClick: () => {
                  if (b.confirm && typeof globalThis.confirm === "function") {
                    if (!globalThis.confirm(b.confirm)) return;
                  }
                  ctx.onButton?.(b.name);
                },
              },
              b.string ?? b.name,
            ),
          ),
        )
      : null,
  );
}

export interface TreeColumn {
  name: string;
  string: string;
}

export function treeColumns(view: ParsedView): TreeColumn[] {
  const cols: TreeColumn[] = [];
  const walk = (n: ViewNode) => {
    if (n.tag === "field" && n.attrs.name) {
      const meta = view.fields[n.attrs.name];
      cols.push({
        name: n.attrs.name,
        string: meta?.string ?? n.attrs.string ?? n.attrs.name,
      });
    }
    for (const c of n.children) walk(c);
  };
  walk(view.arch);
  return cols;
}
