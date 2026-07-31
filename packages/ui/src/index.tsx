import type { CSSProperties, ReactNode } from "react";
import { createElement } from "react";

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

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const style =
    props.variant === "primary"
      ? primaryStyle
      : props.variant === "danger"
        ? { ...buttonStyle, borderColor: "var(--epiton-danger)", color: "var(--epiton-danger)" }
        : buttonStyle;
  return createElement(
    "button",
    {
      type: props.type ?? "button",
      onClick: props.onClick,
      disabled: props.disabled,
      style,
    },
    props.children,
  );
}

export function Panel(props: { children: ReactNode; title?: string }) {
  return createElement(
    "section",
    {
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
