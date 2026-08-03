import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { createElement } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--epiton-border)",
  background: "var(--epiton-bg-elevated)",
  color: "var(--epiton-fg)",
  borderRadius: "999px",
  padding: "0.55rem 1rem",
  font: "inherit",
  cursor: "pointer",
};

const primaryStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--epiton-accent)",
  color: "#06241f",
  borderColor: "transparent",
  fontWeight: 600,
};

export function Button(
  props: {
    children?: ReactNode;
    onClick?: () => void;
    type?: "button" | "submit";
    variant?: "default" | "primary" | "danger" | "ghost";
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
  } & Pick<ButtonHTMLAttributes<HTMLButtonElement>, "aria-expanded">,
) {
  const style =
    props.variant === "primary"
      ? primaryStyle
      : props.variant === "danger"
        ? { ...buttonStyle, borderColor: "var(--epiton-danger)", color: "var(--epiton-danger)" }
        : props.variant === "ghost"
          ? {
              ...buttonStyle,
              background: "transparent",
              borderColor: "transparent",
              padding: "0.35rem 0.55rem",
            }
          : buttonStyle;
  return createElement(
    "button",
    {
      type: props.type ?? "button",
      onClick: props.onClick,
      disabled: props.disabled,
      className: cx("epiton-ui-button", props.className),
      style,
      "aria-label": props["aria-label"],
      "aria-expanded": props["aria-expanded"],
    },
    props.children,
  );
}

export function Panel(props: { children: ReactNode; title?: string; className?: string }) {
  return createElement(
    "section",
    {
      className: cx("epiton-ui-panel", props.className),
      style: {
        background: "color-mix(in oklab, var(--epiton-bg-elevated) 92%, transparent)",
        border: "1px solid var(--epiton-border)",
        borderRadius: "var(--epiton-radius)",
        padding: "1rem 1.15rem",
        backdropFilter: "blur(10px)",
      },
    },
    props.title
      ? createElement("h2", { style: { marginTop: 0, fontSize: "1.1rem" } }, props.title)
      : null,
    props.children,
  );
}

export function BrandMark(props: { subtitle?: string }) {
  return createElement(
    "div",
    { className: "epiton-brand", style: { lineHeight: 1.1 } },
    createElement("div", { style: { fontSize: "2.4rem" } }, "Epiton"),
    props.subtitle
      ? createElement(
          "div",
          {
            style: {
              color: "var(--epiton-muted)",
              fontFamily: "var(--epiton-font-body)",
              fontSize: "0.95rem",
            },
          },
          props.subtitle,
        )
      : null,
  );
}

export function StateBlock(props: {
  state: "loading" | "empty" | "error" | "data";
  message?: string;
  children?: ReactNode;
}) {
  if (props.state === "data") return createElement("div", null, props.children);
  const color = props.state === "error" ? "var(--epiton-danger)" : "var(--epiton-muted)";
  return createElement(
    "div",
    {
      role: props.state === "error" ? "alert" : "status",
      className: "epiton-ui-state",
      style: {
        padding: "2rem",
        textAlign: "center",
        color,
        border: "1px dashed var(--epiton-border)",
        borderRadius: "var(--epiton-radius)",
      },
    },
    props.message ?? props.state,
  );
}

/** shadcn-style text input primitive. */
export function Input(props: InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  const { className, ...rest } = props;
  return createElement("input", {
    ...rest,
    className: cx("epiton-ui-input", className),
  });
}

export function Badge(props: {
  children: ReactNode;
  tone?: "default" | "accent" | "danger" | "muted";
  className?: string;
}) {
  return createElement(
    "span",
    {
      className: cx(
        "epiton-ui-badge",
        `epiton-ui-badge-${props.tone ?? "default"}`,
        props.className,
      ),
    },
    props.children,
  );
}

export function Separator(props: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return createElement("hr", {
    className: cx(
      "epiton-ui-separator",
      props.orientation === "vertical" && "epiton-ui-separator-vertical",
      props.className,
    ),
  });
}

export function Tabs(props: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return createElement(
    "div",
    {
      className: cx("epiton-ui-tabs", props.className),
      role: "tablist",
      "aria-label": props["aria-label"],
    },
    props.children,
  );
}

export function Tab(props: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return createElement(
    "button",
    {
      type: "button",
      role: "tab",
      "aria-selected": Boolean(props.active),
      "data-active": Boolean(props.active),
      className: cx("epiton-ui-tab", props.className),
      onClick: props.onClick,
    },
    props.children,
  );
}

function formatMetaValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) {
    const label = value[1] ?? value[0];
    return label == null ? "—" : String(label);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return String(value);
}

/** Sao-style audit strip: create/write date + uid. */
export function MetaStrip(props: { values: Record<string, unknown>; className?: string }) {
  const created = formatMetaValue(props.values.create_date);
  const creator = formatMetaValue(props.values.create_uid);
  const modified = formatMetaValue(props.values.write_date);
  const writer = formatMetaValue(props.values.write_uid);
  const hasAny =
    props.values.create_date != null ||
    props.values.write_date != null ||
    props.values.create_uid != null ||
    props.values.write_uid != null;
  if (!hasAny) return null;

  return createElement(
    "dl",
    { className: cx("epiton-ui-meta", props.className), "aria-label": "Record audit" },
    createElement(
      "div",
      null,
      createElement("dt", null, "Created"),
      createElement("dd", null, `${created} · ${creator}`),
    ),
    createElement(
      "div",
      null,
      createElement("dt", null, "Modified"),
      createElement("dd", null, `${modified} · ${writer}`),
    ),
  );
}

/** Inline status / notice banner (shadcn Alert recipe). */
export function Alert(props: {
  children?: ReactNode;
  tone?: "default" | "accent" | "danger" | "muted";
  className?: string;
  role?: "status" | "alert";
}) {
  const tone = props.tone ?? "default";
  return createElement(
    "div",
    {
      role: props.role ?? (tone === "danger" ? "alert" : "status"),
      className: cx("epiton-ui-alert", `epiton-ui-alert-${tone}`, props.className),
    },
    props.children,
  );
}

/** Native modal confirm — replaces window.confirm for destructive actions. */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return createElement(
    "div",
    {
      className: "epiton-ui-confirm-root",
      role: "presentation",
      onClick: props.onCancel,
      onKeyDown: (e: { key: string }) => {
        if (e.key === "Escape") props.onCancel();
      },
    },
    createElement(
      "div",
      {
        className: "epiton-ui-confirm",
        role: "alertdialog",
        "aria-modal": true,
        "aria-labelledby": "epiton-confirm-title",
        "aria-describedby": props.description ? "epiton-confirm-desc" : undefined,
        onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      },
      createElement(
        "h2",
        { id: "epiton-confirm-title", className: "epiton-ui-confirm-title" },
        props.title,
      ),
      props.description
        ? createElement(
            "p",
            { id: "epiton-confirm-desc", className: "epiton-ui-confirm-desc" },
            props.description,
          )
        : null,
      createElement(
        "div",
        { className: "epiton-ui-confirm-actions" },
        createElement(
          Button,
          { type: "button", onClick: props.onCancel },
          props.cancelLabel ?? "Cancel",
        ),
        createElement(
          Button,
          {
            type: "button",
            variant: props.danger ? "danger" : "primary",
            onClick: props.onConfirm,
          },
          props.confirmLabel ?? "Confirm",
        ),
      ),
    ),
  );
}

export { cx as cn };
