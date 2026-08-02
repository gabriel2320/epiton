# Epiton desktop (Tauri 2)

Wraps `@epiton/web` with a native window. Session tokens are memory-only. The
native shell exposes one deletion-only command for the exact legacy session
file; it does not register a generic preference-store plugin. Legacy values are
never read or hydrated.

```bash
pnpm --filter @epiton/desktop dev
pnpm --filter @epiton/desktop build:tauri
pnpm --filter @epiton/desktop build:linux # DEB + AppImage
```

Requires Rust + platform WebView dependencies.
CI builds and uploads unsigned Linux DEB/AppImage artifacts. Platform signing
and real-device acceptance remain release gates.

## Shell depth

- Window title tracks model / user / database
- `data-shell="tauri"` enables safe-area / chrome CSS
- Login lives for the current process; restart requires authentication
- App boot clears legacy session slots; logout clears memory

Still thinner than GTK (no native print plugins). Prefer web Sao parity first.
