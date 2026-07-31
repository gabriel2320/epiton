# Epiton mobile (Capacitor 7)

Same UI bundle as web (`@epiton/web` → copied into `www/` → native shells).

```bash
pnpm --filter @epiton/mobile sync
pnpm --filter @epiton/mobile open:android   # requires Android Studio
```

## Shell depth vs Sao

- Adaptive layouts from `@epiton/intelligence` switch to cards under 720px
- `data-shell="capacitor"` + safe-area CSS insets
- Session JSON in Capacitor Preferences via web
  [`secureSessionBridge.ts`](../web/src/lib/secureSessionBridge.ts) (not PHI;
  synthetic lab only)

Never put Tryton session tokens in `localStorage`. Full GTK-class native
widgets remain out of scope.
