import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createElement, useId, useState } from "react";
import {
  formatTrytonDate,
  formatTrytonTime,
  parseTrytonDateInput,
  parseTrytonTimeInput,
} from "./dates";
import { t } from "./i18n";
import { parseViewLayoutAttributes } from "./layout";
import type { ParsedView, SelectionKey, ViewField, ViewNode } from "./parse";
import { type WidgetRegistry, resolveFieldWidget } from "./plugins";
import { evalDomain, resolveStatesAttr } from "./pyson";
import { relationRecordCount } from "./relations";
import { decodeSelectionKey, encodeSelectionKey, normalizeSelectionKey } from "./selections";

export type RecordValues = Record<string, unknown>;

export interface RenderContext {
  values: RecordValues;
  mode: "read" | "write";
  density: "compact" | "comfortable";
  model?: string;
  widgets?: WidgetRegistry;
  onChange?: (name: string, value: unknown) => void;
  onButton?: (name: string, meta?: { type?: string }) => void;
  isButtonPending?: (name: string) => boolean;
  onOpenRelation?: (field: ViewField, value: unknown, domain?: unknown[]) => void;
  onBinaryDownload?: (field: ViewField, value: unknown) => void;
  renderField?: (field: ViewField, value: unknown) => ReactNode;
}

/** Sao-style exclusive notebook tabs (replaces multi-open `<details>`). */
function NotebookHost(props: {
  pages: Array<{ key: string; title: string; content: ReactNode }>;
  density: string;
}) {
  const notebookId = useId();
  const [active, setActive] = useState(0);
  const safe = Math.min(active, Math.max(0, props.pages.length - 1));

  function selectPage(i: number) {
    setActive(i);
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let next = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (currentIndex + 1) % props.pages.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (currentIndex - 1 + props.pages.length) % props.pages.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = props.pages.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectPage(next);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(next)
      .focus();
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
            "aria-controls": `${notebookId}-panel-${i}`,
            id: `${notebookId}-tab-${i}`,
            className: "epiton-notebook-tab",
            "data-active": i === safe,
            tabIndex: i === safe ? 0 : -1,
            onClick: () => selectPage(i),
            onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => moveFocus(event, i),
          },
          page.title,
        ),
      ),
    ),
    props.pages.map((page, i) =>
      createElement(
        "div",
        {
          key: page.key,
          className: "epiton-notebook-panel",
          role: "tabpanel",
          id: `${notebookId}-panel-${i}`,
          "aria-labelledby": `${notebookId}-tab-${i}`,
          hidden: i !== safe,
        },
        page.content,
      ),
    ),
  );
}

function alignmentKeyword(value: number): "start" | "center" | "end" {
  if (value <= 0.25) return "start";
  if (value >= 0.75) return "end";
  return "center";
}

function layoutGridStyle(node: ViewNode): CSSProperties {
  const layout = parseViewLayoutAttributes(node.attrs);
  const template =
    layout.columns === null
      ? "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))"
      : `repeat(${layout.columns}, minmax(0, 1fr))`;
  return { "--epiton-layout-template": template } as CSSProperties;
}

function layoutCellStyle(node: ViewNode, parent: ViewNode): CSSProperties {
  const layout = parseViewLayoutAttributes(node.attrs);
  const fullWidth =
    node.tag === "newline" ||
    node.tag === "separator" ||
    (node.attrs.colspan === undefined &&
      (["notebook", "hpaned", "vpaned", "sheet"].includes(node.tag) ||
        (node.tag === "group" && parent.tag === "form")));
  return {
    ...(fullWidth ? { gridColumn: "1 / -1" } : { gridColumnEnd: `span ${layout.colspan}` }),
    gridRowEnd: `span ${layout.rowspan}`,
    justifySelf: layout.xfill ? "stretch" : alignmentKeyword(layout.xalign),
    alignSelf: layout.yfill ? "stretch" : alignmentKeyword(layout.yalign),
  };
}

function fieldNodeIsInvisible(node: ViewNode, view: ParsedView, values: RecordValues): boolean {
  const name = node.attrs.name ?? "";
  return (
    resolveStatesAttr(node.attrs.states, values).invisible === true ||
    resolveStatesAttr(view.fields[name]?.states, values).invisible === true
  );
}

function renderLayoutChildren(node: ViewNode, view: ParsedView, ctx: RenderContext): ReactNode[] {
  return node.children.map((child, index) => {
    const previous = node.children[index - 1];
    const next = node.children[index + 1];
    const hasExplicitLabel =
      child.tag === "field" &&
      Boolean(child.attrs.name) &&
      previous?.tag === "label" &&
      previous.attrs.name === child.attrs.name &&
      !resolveStatesAttr(previous.attrs.states, ctx.values).invisible &&
      !fieldNodeIsInvisible(child, view, ctx.values);
    const labelsFollowingField =
      child.tag === "label" &&
      Boolean(child.attrs.name) &&
      next?.tag === "field" &&
      next.attrs.name === child.attrs.name &&
      !resolveStatesAttr(child.attrs.states, ctx.values).invisible &&
      !fieldNodeIsInvisible(next, view, ctx.values);
    const rendered = renderNode(child, view, ctx, { hideFieldLabel: hasExplicitLabel });
    if (rendered === null || rendered === undefined || rendered === false) return null;
    const layout = parseViewLayoutAttributes(child.attrs);
    const flowClass =
      child.tag === "newline"
        ? " epiton-layout-newline"
        : child.tag === "separator"
          ? " epiton-layout-separator"
          : "";
    return createElement(
      "div",
      {
        key: `${child.tag}-${child.attrs.name ?? child.attrs.string ?? index}-${index}`,
        className: `epiton-layout-cell${flowClass}`,
        style: layoutCellStyle(child, node),
        "data-colspan": child.attrs.colspan ?? "default",
        "data-rowspan": layout.rowspan,
        "data-xexpand": layout.xexpand,
        "data-yexpand": layout.yexpand,
        "data-layout-role": labelsFollowingField ? "label" : hasExplicitLabel ? "control" : "wide",
      },
      rendered,
    );
  });
}

function layoutGrid(node: ViewNode, view: ParsedView, ctx: RenderContext): ReactNode {
  const layout = parseViewLayoutAttributes(node.attrs);
  return createElement(
    "div",
    {
      className: `epiton-layout-grid epiton-${node.tag}-grid`,
      style: layoutGridStyle(node),
      "data-layout-columns": layout.columns ?? "auto",
    },
    renderLayoutChildren(node, view, ctx),
  );
}

function ExpandableGroup(props: {
  node: ViewNode;
  view: ParsedView;
  ctx: RenderContext;
}) {
  const regionId = useId();
  const raw = props.node.attrs.expandable?.trim().toLowerCase();
  const [expanded, setExpanded] = useState(!["0", "false", "no", "off"].includes(raw ?? ""));
  const title = props.node.attrs.string ?? "Section";

  return createElement(
    "section",
    {
      className: `epiton-group epiton-expandable-group density-${props.ctx.density}`,
      "data-string": props.node.attrs.string,
    },
    createElement(
      "h3",
      { className: "epiton-group-title" },
      createElement(
        "button",
        {
          type: "button",
          className: "epiton-group-toggle",
          "aria-expanded": expanded,
          "aria-controls": regionId,
          onClick: () => setExpanded((current) => !current),
        },
        createElement("span", { "aria-hidden": true }, expanded ? "▾" : "▸"),
        title,
      ),
    ),
    createElement(
      "div",
      { id: regionId, hidden: !expanded },
      layoutGrid(props.node, props.view, props.ctx),
    ),
  );
}

function renderContainerNode(
  node: ViewNode,
  view: ParsedView,
  ctx: RenderContext,
  showTitle = true,
): ReactNode {
  if (node.tag === "group" && node.attrs.expandable !== undefined) {
    return createElement(ExpandableGroup, { node, view, ctx });
  }
  return createElement(
    "section",
    {
      className: `epiton-${node.tag} density-${ctx.density}`,
      "data-string": node.attrs.string,
    },
    showTitle && node.attrs.string
      ? createElement("h3", { className: "epiton-group-title" }, node.attrs.string)
      : null,
    layoutGrid(node, view, ctx),
  );
}

function renderPanedNode(node: ViewNode, view: ParsedView, ctx: RenderContext): ReactNode {
  const horizontal = node.tag === "hpaned";
  const layout = parseViewLayoutAttributes(node.attrs);
  const panes = node.children.slice(0, 2);
  const style = (
    layout.position === null ? undefined : { "--epiton-pane-position": `${layout.position}px` }
  ) as CSSProperties | undefined;
  const children: ReactNode[] = [];

  panes.forEach((pane, index) => {
    if (index > 0) {
      children.push(
        createElement("div", {
          key: "divider",
          className: "epiton-paned-divider",
          role: "separator",
          "aria-orientation": horizontal ? "vertical" : "horizontal",
        }),
      );
    }
    const contentNodes = pane.tag === "child" ? pane.children : [pane];
    children.push(
      createElement(
        "div",
        { key: `pane-${index}`, className: "epiton-paned-pane" },
        contentNodes.map((child, childIndex) =>
          createElement(
            "div",
            { key: `${child.tag}-${child.attrs.name ?? childIndex}` },
            renderNode(child, view, ctx),
          ),
        ),
      ),
    );
  });

  return createElement(
    "div",
    {
      className: `epiton-paned epiton-paned-${horizontal ? "horizontal" : "vertical"}`,
      role: "group",
      "aria-label":
        node.attrs.string ??
        (horizontal
          ? t("epiton.horizontalSplit", "Horizontal split")
          : t("epiton.verticalSplit", "Vertical split")),
      "data-position": layout.position ?? undefined,
      style,
    },
    children,
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
    const selectedKey = normalizeSelectionKey(value);
    return createElement(
      "select",
      {
        ...common,
        value: selectedKey === undefined ? "" : encodeSelectionKey(selectedKey),
        onChange: (e: { target: { value: string } }) => {
          const selected = decodeSelectionKey(field.selection ?? [], e.target.value);
          ctx.onChange?.(field.name, selected);
        },
      },
      field.selection.map(([k, label], index) =>
        createElement(
          "option",
          { key: `${encodeSelectionKey(k)}-${index}`, value: encodeSelectionKey(k) },
          label,
        ),
      ),
    );
  }

  if (field.type === "multiselection" && field.selection) {
    const selected = Array.isArray(value)
      ? value
          .map(normalizeSelectionKey)
          .filter((key): key is SelectionKey => key !== undefined)
          .map(encodeSelectionKey)
      : [];
    return createElement(
      "select",
      {
        ...common,
        multiple: true,
        value: selected,
        size: Math.min(6, field.selection.length || 3),
        onChange: (e: { target: { selectedOptions: HTMLCollectionOf<HTMLOptionElement> } }) => {
          const next = Array.from(e.target.selectedOptions).map((option) => {
            return decodeSelectionKey(field.selection ?? [], option.value);
          });
          ctx.onChange?.(
            field.name,
            next.filter((key): key is SelectionKey => key !== undefined),
          );
        },
      },
      field.selection.map(([k, label], index) =>
        createElement(
          "option",
          { key: `${encodeSelectionKey(k)}-${index}`, value: encodeSelectionKey(k) },
          label,
        ),
      ),
    );
  }

  if (field.type === "reference") {
    const modelPart = Array.isArray(value) ? String(value[0] ?? "") : "";
    const idPart = Array.isArray(value) ? String(value[1] ?? "") : "";
    const models = field.selection?.length
      ? field.selection
      : [[modelPart || "", modelPart || "model"]];
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
              createElement(
                "option",
                { key: String(k || label), value: String(k ?? "") },
                label || String(k ?? ""),
              ),
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
            t("epiton.open", "Open"),
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
    const fileLabel =
      field.filename && ctx.values[field.filename] != null && ctx.values[field.filename] !== ""
        ? String(ctx.values[field.filename])
        : null;
    return createElement(
      "div",
      { className: "epiton-binary" },
      createElement(
        "span",
        null,
        hasData
          ? fileLabel
            ? `${t("epiton.file", "File")}: ${fileLabel}`
            : t("epiton.binaryAttached", "Binary attached")
          : t("epiton.noFile", "No file"),
      ),
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
        t("epiton.download", "Download"),
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
                  if (field.filename) ctx.onChange?.(field.filename, file.name);
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
      createElement(
        "div",
        { className: "epiton-o2m-count" },
        `${count} ${t("epiton.records", "record(s)")}`,
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => ctx.onOpenRelation?.(field, value, domain),
        },
        t("epiton.openLines", "Open lines"),
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
        t("epiton.search", "Search"),
      ),
      createElement(
        "button",
        {
          type: "button",
          disabled: value == null,
          onClick: () => ctx.onOpenRelation?.(field, value, domain),
        },
        t("epiton.open", "Open"),
      ),
    );
  }

  const temporalWidget =
    field.widget === "date" || field.widget === "time" ? field.widget : undefined;
  if (temporalWidget || field.type === "date" || field.type === "datetime") {
    const inputKind = temporalWidget ?? (field.type === "date" ? "date" : "datetime");
    const display =
      inputKind === "time"
        ? formatTrytonTime(value)
        : formatTrytonDate(value, inputKind === "datetime");
    return createElement("input", {
      ...common,
      type: inputKind === "datetime" ? "datetime-local" : inputKind,
      value: display,
      onChange: (e: { target: { value: string } }) => {
        const next =
          inputKind === "time"
            ? parseTrytonTimeInput(e.target.value, value)
            : parseTrytonDateInput(e.target.value, inputKind === "datetime", value);
        ctx.onChange?.(field.name, next);
      },
    });
  }

  const effectiveType = field.widget || field.type;
  if (effectiveType === "email" && ctx.mode === "read" && value) {
    const mail = String(value);
    return createElement("a", { className: "epiton-email", href: `mailto:${mail}` }, mail);
  }
  if (effectiveType === "url" && ctx.mode === "read" && value) {
    const href = String(value);
    if (href.startsWith("javascript:")) {
      return `(${t("epiton.blockedJavascriptUrl", "blocked javascript: URL")})`;
    }
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
        ? createElement(
            "span",
            { className: "epiton-field-label" },
            t("epiton.blockedJavascriptUrl", "javascript: blocked"),
          )
        : href
          ? createElement(
              "a",
              { href, target: "_blank", rel: "noopener noreferrer", className: "epiton-url" },
              t("epiton.open", "Open"),
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
    step: field.type === "integer" ? "1" : inputType === "number" ? "any" : undefined,
    value: value == null ? "" : String(value),
    onChange: (e: { target: { value: string } }) => {
      const raw = e.target.value;
      if (field.type === "integer" || field.type === "float") {
        const number = Number(raw);
        ctx.onChange?.(field.name, raw === "" ? null : Number.isFinite(number) ? number : raw);
        return;
      }
      ctx.onChange?.(field.name, raw);
    },
  });
}

function renderNode(
  node: ViewNode,
  view: ParsedView,
  ctx: RenderContext,
  options: { hideFieldLabel?: boolean } = {},
): ReactNode {
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
        content: renderContainerNode(page, view, ctx, false),
      });
    });
    return createElement(NotebookHost, {
      pages,
      density: ctx.density,
    });
  }

  if (node.tag === "form" || node.tag === "sheet" || node.tag === "group" || node.tag === "page") {
    return renderContainerNode(node, view, ctx);
  }

  if (node.tag === "hpaned" || node.tag === "vpaned") {
    return renderPanedNode(node, view, ctx);
  }

  if (node.tag === "child") {
    return createElement(
      "div",
      { className: "epiton-paned-child" },
      node.children.map((child, index) =>
        createElement(
          "div",
          { key: `${child.tag}-${child.attrs.name ?? index}` },
          renderNode(child, view, ctx),
        ),
      ),
    );
  }

  if (node.tag === "field") {
    const name = node.attrs.name ?? "";
    const field = view.fields[name] ?? {
      name,
      type: "char" as const,
      string: node.attrs.string ?? name,
    };
    const fieldStates = resolveStatesAttr(field.states, ctx.values);
    const nodeStates = resolveStatesAttr(node.attrs.states, ctx.values);
    const states = {
      invisible: fieldStates.invisible || nodeStates.invisible,
      readonly: fieldStates.readonly || nodeStates.readonly,
      required: fieldStates.required || nodeStates.required,
    };
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
      filename: node.attrs.filename ?? field.filename,
      widget: node.attrs.widget ?? field.widget,
    };
    return createElement(
      "div",
      {
        className: "epiton-field",
        "data-field-name": name,
        "data-has-explicit-label": options.hideFieldLabel || undefined,
      },
      options.hideFieldLabel
        ? null
        : createElement(
            "label",
            { className: "epiton-field-label", htmlFor: `epiton-field-${name}` },
            fieldLabel(fieldWithFlags, name),
          ),
      renderInput(fieldWithFlags, value, ctx),
      field.help ? createElement("small", { className: "epiton-field-help" }, field.help) : null,
    );
  }

  if (node.tag === "label") {
    const states = resolveStatesAttr(node.attrs.states, ctx.values);
    const name = node.attrs.name ?? "";
    const fieldStates = resolveStatesAttr(view.fields[name]?.states, ctx.values);
    if (states.invisible || fieldStates.invisible) return null;
    const label = node.attrs.string ?? fieldLabel(view.fields[name], name || node.text || "");
    return createElement(
      "label",
      {
        className: "epiton-label",
        htmlFor: name ? `epiton-field-${name}` : undefined,
        "data-field-name": name || undefined,
      },
      label,
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
    const pending = ctx.isButtonPending?.(name) ?? false;
    if (states.invisible) return null;
    return createElement(
      "button",
      {
        type: "button",
        className: "epiton-button",
        "data-confirm": node.attrs.confirm,
        disabled: states.readonly === true || pending,
        "aria-busy": pending || undefined,
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

  if (node.tag === "newline") {
    return createElement("span", { className: "epiton-newline", "aria-hidden": true });
  }

  if (node.tag === "separator") {
    return createElement(
      "div",
      { className: "epiton-separator", role: "separator" },
      node.attrs.string ? createElement("span", null, node.attrs.string) : null,
    );
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
  );
}

export interface TreeColumn {
  /** Stable per-occurrence key because Tryton may render one field more than once. */
  key: string;
  name: string;
  string: string;
  type?: string;
  widget?: string;
  readonly?: boolean;
  selection?: Array<[SelectionKey, string]>;
  /** Sao `optional="1"` — hidden by default, user can toggle. */
  optional?: boolean;
  /** Sao tree footer aggregate from `sum="1"` / `average="1"`. */
  aggregate?: "sum" | "average";
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
  const occurrences = new Map<string, number>();
  const walk = (n: ViewNode) => {
    if (n.tag === "field" && n.attrs.name) {
      const meta = view.fields[n.attrs.name];
      const occurrence = occurrences.get(n.attrs.name) ?? 0;
      occurrences.set(n.attrs.name, occurrence + 1);
      cols.push({
        key: `${n.attrs.name}:${occurrence}`,
        name: n.attrs.name,
        string: t(meta?.string ?? n.attrs.string ?? n.attrs.name),
        type: meta?.type,
        widget: n.attrs.widget ?? meta?.widget,
        readonly: Boolean(meta?.readonly) || n.attrs.readonly === "1",
        selection: meta?.selection,
        optional: n.attrs.optional === "1" || n.attrs.optional === "true",
        aggregate:
          n.attrs.average === "1" || n.attrs.average === "true"
            ? "average"
            : n.attrs.sum === "1" || n.attrs.sum === "true"
              ? "sum"
              : undefined,
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
