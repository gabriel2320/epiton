# Epiton desktop (Tauri 2)

Wraps `@epiton/web` with a native window. Session tokens should use the OS store
plugin (`apps/desktop/src/secureSession.ts`) — never `localStorage`.

```bash
pnpm --filter @epiton/desktop dev
```

Requires Rust + platform WebView dependencies.

## Sao/GTK habits covered in the web shell

The desktop build is intentionally a thin host: menus, trees, boards, wizards,
and reports live in `@epiton/web`. Native extras today:

- Window title tracks model / user / database (`setShellTitle`)
- `data-shell="tauri"` enables safe-area / chrome CSS
- Optional secure session helpers under `src/secureSession.ts`

Still thinner than GTK (no native print plugins). Prefer web parity first.
