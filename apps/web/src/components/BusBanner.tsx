import { BusClient, type BusMessage } from "@epiton/protocol";
import { Button } from "@epiton/ui";
import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

interface BusNote {
  id: string;
  channel: string;
  summary: string;
  at: number;
}

function summarize(message: unknown): string {
  if (message == null) return "(empty)";
  if (typeof message === "string") return message.slice(0, 120);
  if (typeof message === "number" || typeof message === "boolean") return String(message);
  if (Array.isArray(message)) return `list[${message.length}]`;
  if (typeof message === "object") {
    const obj = message as Record<string, unknown>;
    if (typeof obj.type === "string") return obj.type;
    if (typeof obj.message === "string") return obj.message.slice(0, 120);
    return Object.keys(obj).slice(0, 4).join(", ") || "object";
  }
  return String(message);
}

/** Live bus indicator with recent notification list (Sao parity). */
export function BusBanner() {
  const client = useAppStore((s) => s.client);
  const [notes, setNotes] = useState<BusNote[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "error">("idle");

  useEffect(() => {
    const session = client?.getSession();
    if (!client || !session) {
      setStatus("idle");
      return;
    }
    const bus = new BusClient(client.busUrl(), session);
    let active = true;
    setStatus("listening");
    void (async () => {
      try {
        for await (const msg of bus.listen([`user:${session.userId}`])) {
          if (!active) break;
          appendNote(msg);
        }
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => {
      active = false;
      bus.stop();
    };

    function appendNote(msg: BusMessage) {
      const note: BusNote = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        channel: msg.channel,
        summary: summarize(msg.message),
        at: msg.timestamp ?? Date.now(),
      };
      setNotes((prev) => [note, ...prev].slice(0, 20));
      setOpen(true);
      setStatus("listening");
    }
  }, [client]);

  const latest = notes[0];

  return (
    <div className="epiton-bus">
      <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Bus: {status}
        {latest ? ` · ${latest.summary}` : " idle"}
        {notes.length ? ` (${notes.length})` : ""}
      </Button>
      {open ? (
        <div className="epiton-bus-panel" role="status">
          <div className="epiton-toolbar">
            <strong>Notifications</strong>
            <Button
              onClick={() => {
                setNotes([]);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
          {!notes.length ? (
            <p className="text-sm text-[var(--epiton-muted)]">No bus messages yet</p>
          ) : (
            <ul className="epiton-menu-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <span className="text-sm">
                    <code>{n.channel}</code> · {n.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
