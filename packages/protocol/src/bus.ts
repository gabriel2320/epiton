/** Bus client helper — long-poll against trytond /{db}/bus */
export async function pollBus(
  busUrl: string,
  authorization: string,
  channels: string[],
  lastMessage: number | null = null,
  fetchImpl: typeof fetch = fetch.bind(globalThis),
): Promise<unknown> {
  const response = await fetchImpl(busUrl, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channels, last_message: lastMessage }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) {
    throw new Error(`Bus HTTP ${response.status}`);
  }
  return response.json();
}
