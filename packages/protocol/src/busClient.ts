/** Long-poll Tryton bus helper used by Epiton shell notifications. */
import { type TrytonSessionAuth, sessionAuthorization } from "./auth";

export interface BusMessage {
  channel: string;
  message: unknown;
  timestamp?: number;
}

export class BusClient {
  private readonly busUrl: string;
  private readonly fetchImpl: typeof fetch;
  private lastMessage: number | null = null;
  private aborted = false;

  constructor(
    busUrl: string,
    private session: TrytonSessionAuth,
    fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {
    this.busUrl = busUrl;
    this.fetchImpl = fetchImpl;
  }

  stop(): void {
    this.aborted = true;
  }

  async *listen(channels: string[]): AsyncGenerator<BusMessage> {
    while (!this.aborted) {
      try {
        const payload = await this.fetchImpl(this.busUrl, {
          method: "POST",
          headers: {
            Authorization: sessionAuthorization(this.session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channels,
            last_message: this.lastMessage,
          }),
        });
        if (!payload.ok) {
          await delay(1500);
          continue;
        }
        const data = (await payload.json()) as {
          message?: BusMessage | BusMessage[];
          timestamp?: number;
        };
        if (typeof data.timestamp === "number") this.lastMessage = data.timestamp;
        const messages = Array.isArray(data.message)
          ? data.message
          : data.message
            ? [data.message]
            : [];
        for (const m of messages) yield m;
      } catch {
        await delay(2000);
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
