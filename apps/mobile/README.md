# Epiton mobile (Capacitor 8.5)

Same UI bundle as web (`@epiton/web` → copied into `www/` → native shells).

```bash
pnpm --filter @epiton/mobile sync
pnpm --filter @epiton/mobile sync:android
pnpm --filter @epiton/mobile build:android:debug # JDK + Android SDK
pnpm --filter @epiton/mobile open:android   # requires Android Studio
```

`apps/mobile/android` is tracked source. Generated web assets and APK/AAB build
outputs remain ignored; every build refreshes them from the shared
`@epiton/web` static adapter. CI verifies and uploads the debug-signed APK with
an `epiton.native-artifacts.v1` receipt and `SHA256SUMS`; push builds also get a
GitHub artifact attestation. Android's generated debug certificate is not a
release signature. Release signing, key custody/distribution, and real-device
acceptance are separate, still-open gates.

After a local debug build, generate the same non-promotable receipt from the
repository root:

```bash
node scripts/native-artifact-receipt.mjs \
  --kind android-debug \
  --output .artifacts/native/android-debug/receipt.json \
  apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

The reproducible Android baseline is Node 24.18.1, pnpm 11.18.0, JDK 21,
Android SDK 36, Android Gradle Plugin 8.13.0, and Gradle 8.14.3. These versions
follow Capacitor 8's supported migration baseline rather than mixing arbitrary
newer Android build components.

No iOS project is tracked yet. The `@capacitor/ios` dependency reserves the
matching shell version, but iOS is not built or certified until its Xcode
project, signing, CI artifact, and real-device acceptance evidence exist.

## Shell depth vs Sao

- Adaptive layouts from `@epiton/intelligence` switch to cards under 720px
- `data-shell="capacitor"` + safe-area CSS insets
- Session tokens are memory-only; restart requires authentication
- Android OS backup is disabled for the application
- The web bridge clears the exact legacy Capacitor preference slot and refuses
  new persistence; changing that boundary requires an explicit canon and threat-
  model decision

Never put Tryton session tokens in `localStorage`, `sessionStorage`, plain
Capacitor Preferences, or Tauri plugin-store. Full GTK-class native widgets
remain out of scope.
