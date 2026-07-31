import { Button } from "@epiton/ui";
import { useEffect, useState } from "react";

function fieldText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  return String(value);
}

/** Sao-light email compose: builds a mailto: URL from record fields (no SMTP). */
export function EmailComposeDialog(props: {
  open: boolean;
  model: string;
  recordId: number | null;
  values: Record<string, unknown>;
  onCancel: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!props.open) return;
    const email =
      fieldText(props.values.email) ||
      fieldText(props.values.email_address) ||
      fieldText(props.values.address);
    const name = fieldText(props.values.rec_name) || fieldText(props.values.name);
    setTo(email);
    setSubject(
      name
        ? `${props.model} · ${name}`
        : props.recordId != null
          ? `${props.model} #${props.recordId}`
          : props.model,
    );
    setBody(
      [
        name ? `Hello ${name},` : "Hello,",
        "",
        `Regarding ${props.model}${props.recordId != null ? ` #${props.recordId}` : ""}.`,
        "",
      ].join("\n"),
    );
  }, [props.open, props.values, props.model, props.recordId]);

  if (!props.open) return null;

  function openMailto() {
    const params = new URLSearchParams();
    if (subject.trim()) params.set("subject", subject.trim());
    if (body.trim()) params.set("body", body.trim());
    const q = params.toString();
    const href = `mailto:${to.trim()}${q ? `?${q}` : ""}`;
    if (href.startsWith("javascript:")) return;
    window.open(href, "_blank", "noopener,noreferrer");
    props.onCancel();
  }

  return (
    <div
      className="epiton-ui-confirm-root"
      role="presentation"
      onClick={props.onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onCancel();
      }}
    >
      <div
        className="epiton-ui-confirm epiton-email-compose"
        role="dialog"
        aria-modal
        aria-labelledby="epiton-email-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="epiton-email-title" className="epiton-ui-confirm-title">
          Compose email
        </h2>
        <p className="epiton-ui-confirm-desc">
          Opens your mail client via mailto (Tryton SMTP wizards stay on the server).
        </p>
        <label className="epiton-email-field">
          To
          <input value={to} onChange={(e) => setTo(e.target.value)} aria-label="Email to" />
        </label>
        <label className="epiton-email-field">
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Email subject"
          />
        </label>
        <label className="epiton-email-field">
          Body
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            aria-label="Email body"
          />
        </label>
        <div className="epiton-ui-confirm-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!to.trim()} onClick={openMailto}>
            Open mail client
          </Button>
        </div>
      </div>
    </div>
  );
}
