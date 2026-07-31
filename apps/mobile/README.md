# Epiton mobile (Capacitor 7)

Same UI bundle as web (`@epiton/web` → copied into `www/` → native shells).

```bash
pnpm --filter @epiton/mobile sync
pnpm --filter @epiton/mobile open:android   # requires Android Studio
```

Adaptive layouts from `@epiton/intelligence` switch to cards under 720px width. Session helpers live in `src/secureSession.ts` (Preferences).
