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
CI builds and uploads unsigned Linux DEB/AppImage artifacts with a shared
`epiton.native-artifacts.v1` receipt and `SHA256SUMS`; push builds also get
GitHub artifact attestations. The receipt remains explicitly non-promotable.
Platform signing, signing-key custody/distribution, and real-device acceptance
remain release gates.

After a local Linux build, generate the same receipt from the repository root:

```bash
node scripts/native-artifact-receipt.mjs \
  --kind linux-unsigned \
  --output .artifacts/native/linux-unsigned/receipt.json \
  apps/desktop/src-tauri/target/release/bundle/deb/*.deb \
  apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage
```

## Shell depth

- Window title tracks model / user / database
- `data-shell="tauri"` enables safe-area / chrome CSS
- Login lives for the current process; restart requires authentication
- App boot clears legacy session slots; logout clears memory

Still thinner than GTK (no native print plugins). Prefer web Sao parity first.
