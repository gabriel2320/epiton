import { BusClient } from "@epiton/protocol";
import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

/** Optional live bus indicator (Sao parity notifications). */
export function BusBanner() {
  const client = useAppStore((s) => s.client);
  const [note, setNote] = useState<string>("Bus idle");

  useEffect(() => {
    const session = client?.getSession();
    if (!client || !session) return;
    const bus = new BusClient(client.busUrl(), session);
    let active = true;
    void (async () => {
      for await (const msg of bus.listen([`user:${session.userId}`])) {
        if (!active) break;
        setNote(`Bus: ${msg.channel}`);
      }
    })();
    return () => {
      active = false;
      bus.stop();
    };
  }, [client]);

  return (
    <p className="text-sm text-[var(--epiton-muted)]" role="status">
      {note}
    </p>
  );
}
