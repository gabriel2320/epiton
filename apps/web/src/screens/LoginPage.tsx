import {
  buildSessionContext,
  createClient,
  listDatabases,
  loadUserPreferences,
} from "@epiton/protocol";
import { BrandMark, Button, Panel } from "@epiton/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { normalizeConnectionBaseUrl, runtimeConnectionPolicy } from "../lib/runtimeConfig";
import { type LoginValues, loginSchema } from "../lib/schemas";
import { clearClientAuthentication } from "../lib/sessionBoundary";
import { useAppStore } from "../lib/store";
import { applyClientLanguage } from "../lib/translations";

export function LoginPage() {
  const queryClient = useQueryClient();
  const connection = useAppStore((s) => s.connection);
  const setConnection = useAppStore((s) => s.setConnection);
  const setClient = useAppStore((s) => s.setClient);
  const setSession = useAppStore((s) => s.setSession);
  const setPreferences = useAppStore((s) => s.setPreferences);
  const setError = useAppStore((s) => s.setError);
  const error = useAppStore((s) => s.error);
  const { t, i18n } = useTranslation();
  const [databases, setDatabases] = useState<string[]>([]);
  const runtimePolicy = runtimeConnectionPolicy();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      baseUrl: connection.baseUrl,
      database: connection.database,
      username: "",
      password: "",
    },
  });

  const baseUrl = form.watch("baseUrl");
  const database = form.watch("database");

  useEffect(() => {
    let cancelled = false;
    const url = (baseUrl || "").trim();
    if (!url) {
      setDatabases([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const probe = createClient({
            baseUrl: url,
            database: database || "tryton",
            correlationId: () => crypto.randomUUID(),
          });
          const list = await listDatabases(probe);
          if (!cancelled) setDatabases(list);
        } catch {
          if (!cancelled) setDatabases([]);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [baseUrl, database]);

  async function onSubmit(values: LoginValues) {
    setError(null);
    try {
      const next = {
        baseUrl: normalizeConnectionBaseUrl(values.baseUrl),
        database: values.database.trim(),
      };
      setConnection(next);
      const client = createClient({
        ...next,
        correlationId: () => crypto.randomUUID(),
        onSessionInvalidated: () => clearClientAuthentication(queryClient),
      });
      await client.detectCapabilities();
      const session = await client.login(values.username, values.password, i18n.language);
      const preferences = await loadUserPreferences(client);
      setPreferences(preferences, buildSessionContext(preferences, { user: session.userId }));
      const lang =
        typeof preferences.language === "string"
          ? preferences.language
          : Array.isArray(preferences.language)
            ? String(preferences.language[0] ?? i18n.language)
            : i18n.language;
      await applyClientLanguage(client, lang);
      setClient(client);
      setSession({ login: session.login, userId: session.userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="epiton-login">
      <motion.form
        className="epiton-login-card"
        onSubmit={form.handleSubmit(onSubmit)}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <BrandMark subtitle={t("app.subtitle")} />
        <div className="epiton-toolbar">
          <select
            aria-label="Language"
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
        <Panel title={t("login.connect")} className="epiton-login-fields">
          <label>
            {t("login.server")}
            <input
              {...form.register("baseUrl")}
              readOnly={runtimePolicy.serverLocked}
              aria-describedby={runtimePolicy.serverLocked ? "epiton-gateway-policy" : undefined}
            />
            {runtimePolicy.serverLocked ? (
              <small id="epiton-gateway-policy">{t("login.gatewayPolicy")}</small>
            ) : null}
          </label>
          <label>
            {t("login.database")}
            <input {...form.register("database")} list="epiton-db-list" />
            {databases.length ? (
              <datalist id="epiton-db-list">
                {databases.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            ) : null}
          </label>
          <label>
            {t("login.user")}
            <input {...form.register("username")} />
          </label>
          <label>
            {t("login.password")}
            <input type="password" {...form.register("password")} />
          </label>
          {form.formState.errors.baseUrl ? (
            <p role="alert">{form.formState.errors.baseUrl.message}</p>
          ) : null}
          {error ? (
            <p role="alert" style={{ color: "var(--epiton-danger)" }}>
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("login.connecting") : t("login.enter")}
          </Button>
        </Panel>
      </motion.form>
    </div>
  );
}
