# Epiton mobile (Capacitor 7)

Same UI bundle as web (`@epiton/web` → copied into `www/` → native shells).

```bash
pnpm --filter @epiton/mobile sync
pnpm --filter @epiton/mobile open:android   # requires Android Studio
```

## Shell depth vs Sao

- Adaptive layouts from `@epiton/intelligence` switch to cards under 720px
- `data-shell="capacitor"` + safe-area CSS insets
- Preferences helpers in `src/secureSession.ts` (not PHI; synthetic lab only)

Session storage on device should use Preferences / Keychain — never put Tryton
session tokens in `localStorage`. Full GTK-class native widgets remain out of
scope; deepen web Sao flows first.
