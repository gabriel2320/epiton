import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      "app.brand": "Epiton",
      "app.subtitle": "Tryton-compatible. Multiplatform. Adaptive.",
      "login.connect": "Connect",
      "login.server": "Server",
      "login.database": "Database",
      "login.user": "User",
      "login.password": "Password",
      "login.enter": "Enter Epiton",
      "login.connecting": "Connecting…",
      "shell.command": "Command (Ctrl+K)",
      "shell.favorites": "Favorites",
      "shell.menu": "Menu",
      "shell.suggested": "Suggested",
      "shell.logout": "Logout",
      "party.title": "Parties",
      "party.new": "New",
      "party.refresh": "Refresh",
      "party.save": "Save",
      "party.delete": "Delete",
      "party.mode": "Mode",
    },
  },
  es: {
    translation: {
      "app.brand": "Epiton",
      "app.subtitle": "Compatible con Tryton. Multiplataforma. Adaptativo.",
      "login.connect": "Conectar",
      "login.server": "Servidor",
      "login.database": "Base de datos",
      "login.user": "Usuario",
      "login.password": "Contraseña",
      "login.enter": "Entrar a Epiton",
      "login.connecting": "Conectando…",
      "shell.command": "Comando (Ctrl+K)",
      "shell.favorites": "Favoritos",
      "shell.menu": "Menú",
      "shell.suggested": "Sugerido",
      "shell.logout": "Salir",
      "party.title": "Terceros",
      "party.new": "Nuevo",
      "party.refresh": "Actualizar",
      "party.save": "Guardar",
      "party.delete": "Eliminar",
      "party.mode": "Modo",
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
