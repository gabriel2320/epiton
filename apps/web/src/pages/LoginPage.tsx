import { buildSessionContext, createClient, loadUserPreferences } from "@epiton/protocol";
import { BrandMark, Button, Panel } from "@epiton/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type LoginValues, loginSchema } from "../lib/schemas";
import { useAppStore } from "../lib/store";
import { applyClientLanguage } from "../lib/translations";

export function LoginPage() {
  const connection = useAppStore((s) => s.connection);
  const setConnection = useAppStore((s) => s.setConnection);
  const setClient = useAppStore((s) => s.setClient);
  const setSession = useAppStore((s) => s.setSession);
  const setPreferences = useAppStore((s) => s.setPreferences);
  const setError = useAppStore((s) => s.setError);
  const error = useAppStore((s) => s.error);
  const { t, i18n } = useTranslation();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      baseUrl: connection.baseUrl,
      database: connection.database,
      username: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginValues) {
    setError(null);
    try {
      const next = { baseUrl: values.baseUrl, database: values.database };
      setConnection(next);
      const client = createClient({
        ...next,
        correlationId: () => crypto.randomUUID(),
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
        <Panel title={t("login.connect")}>
          <label>
            {t("login.server")}
            <input {...form.register("baseUrl")} />
          </label>
          <label>
            {t("login.database")}
            <input {...form.register("database")} />
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
