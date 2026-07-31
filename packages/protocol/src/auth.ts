/** Session Authorization header for Tryton JSON-RPC / bus. */
export interface TrytonSessionAuth {
  login: string;
  userId: number;
  session: string;
}

export function sessionAuthorization(session: TrytonSessionAuth): string {
  const raw = `${session.login}:${session.userId}:${session.session}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `Session ${btoa(binary)}`;
}
