# Epiton mobile (Capacitor 7)

Same UI bundle as web (`@epiton/web` → PWA + native shells).

```bash
pnpm --filter @epiton/web build
pnpm --filter @epiton/mobile sync
```

Adaptive layouts from `@epiton/intelligence` switch to cards under 720px width.
