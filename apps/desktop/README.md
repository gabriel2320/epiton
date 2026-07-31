# Epiton desktop (Tauri 2)

Wraps `@epiton/web` with OS-backed session storage (`@tauri-apps/plugin-store`).

```bash
pnpm --filter @epiton/desktop dev
```

Requires Rust + platform WebView dependencies. Performance budget: shell TTI under 2s on mid desktop once web assets are warm.
