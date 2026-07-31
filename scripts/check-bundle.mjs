#!/usr/bin/env node
/**
 * Soft bundle budget: fail if the largest JS asset under apps/web/dist/assets exceeds the limit.
 * Default 700 KiB (gzipped size is better longer-term; this checks raw file size).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const limitKb = Number(process.env.EPITON_BUNDLE_LIMIT_KB ?? 700);
const assetsDir = join(process.cwd(), "apps/web/dist/assets");

let files;
try {
  files = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
} catch {
  console.error("No apps/web/dist/assets — run pnpm --filter @epiton/web build first");
  process.exit(1);
}

const sizes = files.map((f) => {
  const bytes = statSync(join(assetsDir, f)).size;
  return { f, kb: bytes / 1024 };
});
sizes.sort((a, b) => b.kb - a.kb);

console.log("JS assets (largest first):");
for (const s of sizes.slice(0, 8)) {
  console.log(`  ${s.kb.toFixed(1)} KiB  ${s.f}`);
}

const worst = sizes[0];
if (!worst) {
  console.error("No JS assets found");
  process.exit(1);
}
if (worst.kb > limitKb) {
  console.error(
    `Bundle budget exceeded: ${worst.f} is ${worst.kb.toFixed(1)} KiB > ${limitKb} KiB`,
  );
  process.exit(1);
}
console.log(`Budget OK (limit ${limitKb} KiB). Analyze: apps/web/dist/stats.html`);
