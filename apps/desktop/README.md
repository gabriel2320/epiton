# Epiton desktop (Tauri 2)

Wraps `@epiton/web` with a native window. Session tokens are memory-only and the
bridge deliberately refuses persistence until an audited OS secret-store
provider is wired. Legacy persistent slots are cleared and never hydrated.

```bash
pnpm --filter @epiton/desktop dev
```

Requires Rust + platform WebView dependencies.

## Shell depth

- Window title tracks model / user / database
- `data-shell="tauri"` enables safe-area / chrome CSS
- Login lives for the current process; restart requires authentication
- App boot clears legacy session slots; logout clears memory

Still thinner than GTK (no native print plugins). Prefer web Sao parity first.
