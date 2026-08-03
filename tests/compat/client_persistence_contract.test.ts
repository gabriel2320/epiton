import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const compatDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(compatDir, "../..");
const sourceRoots = [
  "apps/web/src",
  "apps/desktop/src",
  "apps/desktop/src-tauri/src",
  "apps/mobile/src",
  "packages/protocol/src",
  "packages/view-engine/src",
  "packages/intelligence/src",
  "packages/ui/src",
].map((path) => join(repoRoot, path));
const deletionOnlyAdapters = new Set([
  "apps/web/src/lib/legacyBrowserPersistence.ts",
  "apps/web/src/lib/legacySessionCapacitor.ts",
  "apps/web/src/lib/legacySessionTauri.ts",
]);

const persistenceApis = [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /document\.cookie/,
  /\bcaches\.(?:open|match|keys|delete)/,
  /\bCacheStorage\b/,
  /\bcookieStore\b/,
  /\bnavigator\.storage\b/,
  /\b(?:Dexie|localforage|idbKeyval)\b/,
  /persistQueryClient/,
  /create(?:Sync|Async)StoragePersister/,
  /(?:window\.)?history\.(?:pushState|replaceState)/,
  /(?:window\.)?location\.(?:hash|search)\s*=/,
  /@tauri-apps\/plugin-store/,
  /@capacitor\/preferences/,
  /\b(?:rusqlite|sqlx|sled|rocksdb)\b/,
  /std::fs::(?:write|create_dir|create_dir_all|OpenOptions)/,
  /(?:std::fs::)?File::create/,
];

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (![".rs", ".ts", ".tsx"].includes(extname(path)) || /\.(?:test|spec)\.[^.]+$/.test(path))
      continue;
    files.push(path);
  }
  return files;
}

describe("client persistence architecture contract", () => {
  it("keeps backend projections and navigation out of durable client stores", () => {
    const violations: string[] = [];
    for (const file of sourceRoots.flatMap(sourceFiles)) {
      const repoPath = relative(repoRoot, file);
      if (deletionOnlyAdapters.has(repoPath)) continue;
      const source = readFileSync(file, "utf8");
      for (const pattern of persistenceApis) {
        if (pattern.test(source)) violations.push(`${repoPath}: ${pattern.source}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("limits migration adapters to deletion and key enumeration", () => {
    const forbiddenWritesOrReads = [
      /\.setItem\s*\(/,
      /\.getItem\s*\(/,
      /Preferences\.set\s*\(/,
      /Preferences\.get\s*\(/,
      /store\.set\s*\(/,
      /store\.get\s*\(/,
    ];
    const violations: string[] = [];
    for (const repoPath of deletionOnlyAdapters) {
      const source = readFileSync(join(repoRoot, repoPath), "utf8");
      for (const pattern of forbiddenWritesOrReads) {
        if (pattern.test(source)) violations.push(`${repoPath}: ${pattern.source}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("limits the service worker to versioned static build assets", () => {
    const viteConfig = readFileSync(join(repoRoot, "apps/web/vite.config.ts"), "utf8");
    expect(viteConfig).toMatch(/workbox:\s*\{\s*runtimeCaching:\s*\[\]\s*\}/);
  });

  it("does not expose the Tauri preference-store persistence surface", () => {
    const nativeFiles = [
      "apps/desktop/package.json",
      "apps/desktop/src-tauri/Cargo.toml",
      "apps/desktop/src-tauri/capabilities/default.json",
      "apps/desktop/src-tauri/src/lib.rs",
      "apps/desktop/src-tauri/tauri.conf.json",
      "apps/web/package.json",
    ];
    const violations = nativeFiles.filter((repoPath) =>
      /(?:tauri[_-]plugin[_-]store|@tauri-apps\/plugin-store|"store(?:"\s*:|:))/.test(
        readFileSync(join(repoRoot, repoPath), "utf8"),
      ),
    );
    expect(violations).toEqual([]);
  });

  it("keeps menu and favorite authority behind the Tryton protocol contract", () => {
    const shell = readFileSync(join(repoRoot, "apps/web/src/screens/Shell.tsx"), "utf8");
    const menus = readFileSync(join(repoRoot, "packages/protocol/src/menus.ts"), "utf8");

    expect(shell).toMatch(/loadMenus\(client, sessionContext\)/);
    expect(shell).toMatch(/setMenuFavorite\(client, id, next, sessionContext\)/);
    expect(shell).not.toMatch(/model\(["']ir\.ui\.menu["'],\s*["']write["']/);
    expect(menus).toMatch(/model\("ir\.ui\.menu\.favorite",\s*"get"/);
    expect(menus).toMatch(/favorite \? "set" : "unset"/);
    expect(menus).not.toMatch(/model\("ir\.ui\.menu",\s*"write"/);
  });
});
