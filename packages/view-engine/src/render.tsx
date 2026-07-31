import type { ReactNode } from "react";
import { createElement, useState } from "react";
import { formatTrytonDate, parseTrytonDateInput } from "./dates";
import { t } from "./i18n";
import type { ParsedView, ViewField, ViewNode } from "./parse";
import { type WidgetRegistry, resolveFieldWidget } from "./plugins";
import { evalDomain, resolveStatesAttr } from "./pyson";
import { relationRecordCount } from "./relations";

export type RecordValues = Record<string, unknown>;

export interface RenderContext {
  values: RecordValues;
  mode: "read" | "write";
  density: "compact" | "comfortable";
  model?: string;
  widgets?: WidgetRegistry;
  onChange?: (name: string, value: unknown) => void;
  onButton?: (name: string, meta?: { type?: string }) => void;
  onOpenRelation?: (field: ViewField, value: unknown, domain?: unknown[]) => void;
  onBinaryDownload?: (field: ViewField, value: unknown) => void;
  renderField?: (field: ViewField, value: unknown) => ReactNode;
}

/** Sao-style exclusive notebook tabs (replaces multi-open `<details>`). */
function NotebookHost(props: {
  pages: Array<{ key: string; title: string; content: ReactNode }>;
  density: string;
  storageKey?: string;
}) {
  const storageKey = props.storageKey ? `epiton.notebook.${props.storageKey}` : null;
  const [active, setActive] = useState(() => {
    if (!storageKey) return 0;
    try {
      const raw = sessionStorage.getItem(storageKey);
      const n = raw == null ? 0 : Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  });
  const safe = Math.min(active, Math.max(0, props.pages.length - 1));
  const current = props.pages[safe];

  function selectPage(i: number) {
    setActive(i);
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, String(i));
    } catch {
      /* ignore quota */
    }
  }

  return createElement(
    "div",
    { className: `epiton-notebook density-${props.density}` },
    createElement(
      "div",
      { className: "epiton-notebook-tabs", role: "tablist" },
      props.pages.map((page, i) =>
        createElement(
          "button",
          {
            key: page.key,
            type: "button",
            role: "tab",
            "aria-selected": i === safe,
            className: "epiton-notebook-tab",
            "data-active": i === safe,
            onClick: () => selectPage(i),
          },
          page.title,
        ),
      ),
    ),
    current
      ? createElement(
          "div",
          {
            className: "epiton-notebook-panel",
            role: "tabpanel",
            "aria-label": current.title,
          },
          current.content,
        )
      : null,
  );
}

function fieldLabel(field: ViewField | undefined, fallback: string): string {
  const raw = field?.string ?? fallback;
  return t(raw, raw);
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

  if (field.type === "multiselection" && field.selection) {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return createElement(
      "select",
      {
        ...common,
        multiple: true,
        value: selected,
        size: Math.min(6, field.selection.length || 3),
        onChange: (e: { target: { selectedOptions: HTMLCollectionOf<HTMLOptionElement> } }) => {
          const next = Array.from(e.target.selectedOptions).map((o) => o.value);
          ctx.onChange?.(field.name, next);
        },
      },
      field.selection.map(([k, label]) => createElement("option", { key: k, value: k }, label)),
    );
  }

  if (field.type === "reference") {
    const modelPart = Array.isArray(value) ? String(value[0] ?? "") : "";
    const idPart = Array.isArray(value) ? String(value[1] ?? "") : "";
    const models = field.selection?.length
      ? field.selection
      : ([[modelPart || "", modelPart || "model"]] as Array<[string, string]>);
    return createElement(
      "div",
      { className: "epiton-reference" },
      field.selection?.length
        ? createElement(
            "select",
            {
              ...common,
              id: `${common.id}-model`,
              value: modelPart,
              "aria-label": `${field.string ?? field.name} model`,
              onChange: (e: { target: { value: string } }) =>
                ctx.onChange?.(field.name, [
                  e.target.value,
                  idPart ? Number(idPart) || idPart : null,
                ]),
            },
            createElement("option", { value: "" }, "— model —"),
            models.map(([k, label]) =>
              createElement("option", { key: k || label, value: k }, label || k),
            ),
          )
        : createElement("input", {
            ...common,
            id: `${common.id}-model`,
            placeholder: "model.name",
            value: modelPart,
            onChange: (e: { target: { value: string } }) =>
              ctx.onChange?.(field.name, [
                e.target.value,
                idPart ? Number(idPart) || idPart : null,
              ]),
          }),
      createElement("input", {
        ...common,
        id: `${common.id}-id`,
        type: "number",
        placeholder: "id",
        value: idPart,
        onChange: (e: { target: { value: string } }) =>
          ctx.onChange?.(field.name, [modelPart, e.target.value ? Number(e.target.value) : null]),
      }),
      ctx.mode === "read" && modelPart && idPart
        ? createElement(
            "button",
            {
              type: "button",
              className: "epiton-button",
              onClick: () => {
                const id = Number(idPart);
                if (!Number.isFinite(id)) return;
                ctx.onOpenRelation?.(
                  {
                    name: field.name,
                    type: "many2one",
                    string: field.string,
                    relation: modelPart,
                  },
                  [id, idPart],
                );
              },
            },
            "Open",
          )
        : null,
    );
  }

  if (field.type === "progressbar") {
    const n = Number(value ?? 0);
    const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n <= 1 ? n * 100 : n)) : 0;
    return createElement(
      "div",
      { className: "epiton-progress", role: "progressbar", "aria-valuenow": pct },
      createElement("div", {
        className: "epiton-progress-bar",
        style: { width: `${pct}%` },
      }),
      createElement("span", null, `${Math.round(pct)}%`),
      ctx.mode === "write"
        ? createElement("input", {
            ...common,
            type: "number",
            min: 0,
            max: 100,
            value: Number.isFinite(n) ? n : 0,
            onChange: (e: { target: { value: string } }) =>
              ctx.onChange?.(field.name, Number(e.target.value)),
          })
        : null,
    );
  }

  if (field.type === "dict") {
    const text =
      value == null
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value, null, ctx.density === "compact" ? 0 : 2);
    return createElement("textarea", {
      ...common,
      className: "epiton-dict",
      value: text,
      rows: ctx.density === "compact" ? 3 : 6,
      spellCheck: false,
      onChange: (e: { target: { value: string } }) => {
        const raw = e.target.value;
        try {
          ctx.onChange?.(field.name, raw.trim() ? JSON.parse(raw) : {});
        } catch {
          ctx.onChange?.(field.name, raw);
        }
      },
    });
  }

  if (field.type === "timedelta") {
    return createElement("input", {
      ...common,
      type: "text",
      placeholder: "HH:MM:SS",
      value: value == null ? "" : String(value),
      onChange: (e: { target: { value: string } }) => ctx.onChange?.(field.name, e.target.value),
    });
  }

  if (field.type === "time") {
    return createElement("input", {
      ...common,
      type: "time",
      value: value == null ? "" : String(value).slice(0, 5),
      onChange: (e: { target: { value: string } }) => ctx.onChange?.(field.name, e.target.value),
    });
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
    const domain = evalDomain(field.domain ?? [], ctx.values);
    const count = relationRecordCount(value);
    return createElement(
      "div",
      { className: "epiton-o2m", "data-relation": field.relation ?? "" },
      createElement("div", { className: "epiton-o2m-count" }, `${count} record(s)`),
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

  const effectiveType = field.widget || field.type;
  if (effectiveType === "email" && ctx.mode === "read" && value) {
    const mail = String(value);
    return createElement("a", { className: "epiton-email", href: `mailto:${mail}` }, mail);
  }
  if (effectiveType === "url" && ctx.mode === "read" && value) {
    const href = String(value);
    if (href.startsWith("javascript:")) return "(blocked javascript: URL)";
    return createElement(
      "a",
      {
        className: "epiton-url",
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      href,
    );
  }

  if (effectiveType === "url" && ctx.mode === "write") {
    const href = value == null ? "" : String(value);
    const blocked = href.toLowerCase().startsWith("javascript:");
    return createElement(
      "div",
      { className: "epiton-url-edit" },
      createElement("input", {
        ...common,
        type: "url",
        value: href,
        "aria-invalid": blocked || undefined,
        onChange: (e: { target: { value: string } }) => {
          const next = e.target.value;
          if (next.toLowerCase().startsWith("javascript:")) return;
          ctx.onChange?.(field.name, next);
        },
      }),
      blocked
        ? createElement("span", { className: "epiton-field-label" }, "javascript: blocked")
        : href
          ? createElement(
              "a",
              { href, target: "_blank", rel: "noopener noreferrer", className: "epiton-url" },
              "Open",
            )
          : null,
    );
  }

  const inputType =
    field.type === "integer" || field.type === "float" || field.type === "numeric"
      ? "number"
      : effectiveType === "password"
        ? "password"
        : effectiveType === "email"
          ? "email"
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

  if (node.tag === "notebook") {
    const pages: Array<{ key: string; title: string; content: ReactNode }> = [];
    node.children.forEach((page, i) => {
      if (page.tag !== "page") return;
      const states = resolveStatesAttr(page.attrs.states, ctx.values);
      if (states.invisible) return;
      pages.push({
        key: `${page.attrs.string ?? "page"}-${i}`,
        title: page.attrs.string ?? `Page ${pages.length + 1}`,
        content: createElement(
          "div",
          { className: "epiton-page" },
          page.children.map((c, j) => createElement("div", { key: j }, renderNode(c, view, ctx))),
        ),
      });
    });
    return createElement(NotebookHost, {
      pages,
      density: ctx.density,
      storageKey: ctx.model ? `${ctx.model}:${pages.map((p) => p.key).join("|")}` : undefined,
    });
  }

  if (node.tag === "form" || node.tag === "sheet" || node.tag === "group" || node.tag === "page") {
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

  if (node.tag === "note") {
    return createElement(
      "aside",
      { className: "epiton-note", role: "note" },
      node.attrs.string ?? node.text ?? "",
    );
  }

  if (node.tag === "button") {
    const name = node.attrs.name ?? "";
    const buttonType = node.attrs.type;
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
          ctx.onButton?.(name, { type: buttonType });
        },
      },
      t(node.attrs.string ?? name, node.attrs.string ?? name),
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
                  ctx.onButton?.(b.name, { type: b.type });
                },
              },
              t(b.string ?? b.name, b.string ?? b.name),
            ),
          ),
        )
      : null,
  );
}

export interface TreeColumn {
  name: string;
  string: string;
  type?: string;
  readonly?: boolean;
  selection?: Array<[string, string]>;
  /** Sao `optional="1"` — hidden by default, user can toggle. */
  optional?: boolean;
}

/** True when tree arch has Sao `editable="top|bottom|1|true"`. */
export function treeEditable(view: ParsedView): boolean {
  const walk = (n: ViewNode): boolean => {
    if (n.tag === "tree") {
      const raw = (n.attrs.editable ?? "").toLowerCase();
      if (raw === "top" || raw === "bottom" || raw === "1" || raw === "true") return true;
    }
    return n.children.some(walk);
  };
  return walk(view.arch);
}

export function treeColumns(view: ParsedView): TreeColumn[] {
  const cols: TreeColumn[] = [];
  const walk = (n: ViewNode) => {
    if (n.tag === "field" && n.attrs.name) {
      const meta = view.fields[n.attrs.name];
      cols.push({
        name: n.attrs.name,
        string: t(meta?.string ?? n.attrs.string ?? n.attrs.name),
        type: meta?.type,
        readonly: Boolean(meta?.readonly) || n.attrs.readonly === "1",
        selection: meta?.selection,
        optional: n.attrs.optional === "1" || n.attrs.optional === "true",
      });
    }
    for (const c of n.children) walk(c);
  };
  walk(view.arch);
  return cols;
}

/** Tree-arch buttons (Activate/Post/…) for row action columns. */
export function treeButtons(
  view: ParsedView,
): Array<{ name: string; string?: string; type?: string; confirm?: string }> {
  const out: Array<{ name: string; string?: string; type?: string; confirm?: string }> = [];
  const walk = (n: ViewNode) => {
    if (n.tag === "button" && n.attrs.name) {
      out.push({
        name: n.attrs.name,
        string: n.attrs.string,
        type: n.attrs.type,
        confirm: n.attrs.confirm,
      });
    }
    for (const c of n.children) walk(c);
  };
  walk(view.arch);
  return out;
}

/** Sao editable placement when set on `<tree editable="top|bottom">`. */
export function treeEditablePlacement(view: ParsedView): "top" | "bottom" | null {
  const walk = (n: ViewNode): "top" | "bottom" | null => {
    if (n.tag === "tree") {
      const raw = (n.attrs.editable ?? "").toLowerCase();
      if (raw === "top") return "top";
      if (raw === "bottom") return "bottom";
      if (raw === "1" || raw === "true") return "bottom";
    }
    for (const c of n.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(view.arch);
}
