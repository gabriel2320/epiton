# Epiton desktop (Tauri 2)

Wraps `@epiton/web` with a native window. Session tokens persist via the OS store
plugin (`@tauri-apps/plugin-store`), driven by the web bridge
[`secureSessionBridge.ts`](../web/src/lib/secureSessionBridge.ts) — never
`localStorage`.

```bash
pnpm --filter @epiton/desktop dev
```

Requires Rust + platform WebView dependencies.

## Shell depth

- Window title tracks model / user / database
- `data-shell="tauri"` enables safe-area / chrome CSS
- Login persists session; App boot hydrates; logout clears store

Still thinner than GTK (no native print plugins). Prefer web Sao parity first.
