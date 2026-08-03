/** Long-poll Tryton bus helper used by Epiton shell notifications. */
import { sessionAuthorization, type TrytonSessionAuth } from "./auth";

export interface BusMessage {
  channel: string;
  message: unknown;
  timestamp?: number;
}

export interface BusClientOptions {
  fetchImpl?: typeof fetch;
  onSessionInvalidated?: () => void;
}

export class BusClient {
  private readonly busUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionInvalidated?: () => void;
  private lastMessage: number | null = null;
  private aborted = false;

  constructor(
    busUrl: string,
    private session: TrytonSessionAuth,
    options: BusClientOptions = {},
  ) {
    this.busUrl = busUrl;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.onSessionInvalidated = options.onSessionInvalidated;
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
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (payload.status === 401) {
          this.aborted = true;
          try {
            this.onSessionInvalidated?.();
          } catch {
            // The bus must stop even if a UI observer fails.
          }
          return;
        }
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
