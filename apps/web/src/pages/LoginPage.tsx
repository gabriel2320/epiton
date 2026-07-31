import { createClient } from "@epiton/protocol";
import { BrandMark, Button, Panel } from "@epiton/ui";
import { type FormEvent, useState } from "react";
import { useAppStore } from "../lib/store";

export function LoginPage() {
  const connection = useAppStore((s) => s.connection);
  const setConnection = useAppStore((s) => s.setConnection);
  const setClient = useAppStore((s) => s.setClient);
  const setSession = useAppStore((s) => s.setSession);
  const setError = useAppStore((s) => s.setError);
  const error = useAppStore((s) => s.error);

  const [baseUrl, setBaseUrl] = useState(connection.baseUrl);
  const [database, setDatabase] = useState(connection.database);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = { baseUrl, database };
      setConnection(next);
      const client = createClient({
        ...next,
        correlationId: () => crypto.randomUUID(),
      });
      await client.detectCapabilities();
      const session = await client.login(username, password);
      setClient(client);
      setSession({ login: session.login, userId: session.userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="epiton-login">
      <form className="epiton-login-card" onSubmit={onSubmit}>
        <BrandMark subtitle="Tryton-compatible. Multiplatform. Adaptive." />
        <Panel title="Connect">
          <label>
            Server
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
          </label>
          <label>
            Database
            <input value={database} onChange={(e) => setDatabase(e.target.value)} required />
          </label>
          <label>
            User
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? (
            <p role="alert" style={{ color: "var(--epiton-danger)" }}>
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Connecting…" : "Enter Epiton"}
          </Button>
        </Panel>
      </form>
    </div>
  );
}
