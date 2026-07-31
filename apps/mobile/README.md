# Epiton mobile (Capacitor 7)

Same UI bundle as web (`@epiton/web` → copied into `www/` → native shells).

```bash
pnpm --filter @epiton/mobile sync
pnpm --filter @epiton/mobile open:android   # requires Android Studio
```

## Shell depth vs Sao

- Adaptive layouts from `@epiton/intelligence` switch to cards under 720px
- `data-shell="capacitor"` + safe-area CSS insets
- Session tokens are memory-only; restart requires authentication
- The web bridge clears legacy Capacitor preference slots and refuses new
  persistence until an audited native secret-store provider exists

Never put Tryton session tokens in `localStorage`, `sessionStorage`, plain
Capacitor Preferences, or Tauri plugin-store. Full GTK-class native widgets
remain out of scope.
