import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildNativeArtifactReceipt,
  writeNativeArtifactReceipt,
} from "./native-artifact-receipt.mjs";

const FIXED_TOOLCHAIN = {
  node: "24.18.1",
  pnpm: "11.18.0",
  rust: "1.97.1",
  lockfileSha256: "0".repeat(64),
};

async function fixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "epiton-native-receipt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("writes a deterministic Android debug receipt without a production claim", async (t) => {
  const projectRoot = await fixtureRoot(t);
  const artifactPath = "apps/mobile/app-debug.apk";
  await mkdir(join(projectRoot, "apps/mobile"), { recursive: true });
  await writeFile(join(projectRoot, artifactPath), "synthetic-apk");

  const { receipt, receiptPath, checksumPath } = await writeNativeArtifactReceipt({
    projectRoot,
    kind: "android-debug",
    outputPath: ".artifacts/native/android-debug/receipt.json",
    artifactPaths: [artifactPath],
    revision: "a".repeat(40),
    workingTreeDirty: true,
    now: () => new Date("2026-08-03T12:00:00.000Z"),
    env: {},
    toolchain: FIXED_TOOLCHAIN,
  });

  assert.equal(receipt.schema, "epiton.native-artifacts.v1");
  assert.equal(receipt.signing.status, "debug-only");
  assert.equal(receipt.signing.productionEligible, false);
  assert.equal(receipt.workingTreeDirty, true);
  assert.deepEqual(receipt.artifacts, [
    {
      path: artifactPath,
      format: "android-apk",
      bytes: 13,
      sha256: digest("synthetic-apk"),
    },
  ]);
  assert.equal(JSON.parse(await readFile(receiptPath, "utf8")).revision, "a".repeat(40));
  assert.equal(
    await readFile(checksumPath, "utf8"),
    [
      `${digest(`${JSON.stringify(receipt, null, 2)}\n`)}  .artifacts/native/android-debug/receipt.json`,
      `${digest("synthetic-apk")}  ${artifactPath}`,
      "",
    ].join("\n"),
  );
});

test("sorts Linux artifacts and requires both package formats", async (t) => {
  const projectRoot = await fixtureRoot(t);
  await mkdir(join(projectRoot, "dist"), { recursive: true });
  await Promise.all([
    writeFile(join(projectRoot, "dist/epiton.deb"), "deb"),
    writeFile(join(projectRoot, "dist/Epiton.AppImage"), "appimage"),
  ]);

  const receipt = await buildNativeArtifactReceipt({
    projectRoot,
    kind: "linux-unsigned",
    artifactPaths: ["dist/epiton.deb", "dist/Epiton.AppImage"],
    revision: "b".repeat(40),
    workingTreeDirty: false,
    now: () => new Date("2026-08-03T12:00:00.000Z"),
    env: { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "42" },
    toolchain: FIXED_TOOLCHAIN,
  });

  assert.deepEqual(
    receipt.artifacts.map((artifact) => artifact.path),
    ["dist/Epiton.AppImage", "dist/epiton.deb"],
  );
  assert.equal(receipt.signing.status, "unsigned");
  assert.equal(receipt.ci.provider, "github-actions");

  await assert.rejects(
    buildNativeArtifactReceipt({
      projectRoot,
      kind: "linux-unsigned",
      artifactPaths: ["dist/epiton.deb"],
      revision: "b".repeat(40),
      workingTreeDirty: false,
      toolchain: FIXED_TOOLCHAIN,
    }),
    /Missing required appimage artifact/,
  );
});

test("rejects duplicate, symlinked, and out-of-root artifacts", async (t) => {
  const projectRoot = await fixtureRoot(t);
  const outsideRoot = await fixtureRoot(t);
  await writeFile(join(projectRoot, "app.apk"), "apk");
  await writeFile(join(outsideRoot, "outside.apk"), "outside");
  await symlink(join(projectRoot, "app.apk"), join(projectRoot, "linked.apk"));
  await mkdir(join(projectRoot, "real"));
  await writeFile(join(projectRoot, "real/nested.apk"), "nested");
  await symlink(join(projectRoot, "real"), join(projectRoot, "linked-directory"));
  const baseOptions = {
    projectRoot,
    kind: "android-debug",
    revision: "c".repeat(40),
    workingTreeDirty: false,
    toolchain: FIXED_TOOLCHAIN,
  };

  await assert.rejects(
    buildNativeArtifactReceipt({ ...baseOptions, artifactPaths: ["app.apk", "./app.apk"] }),
    /Duplicate artifact/,
  );
  await assert.rejects(
    buildNativeArtifactReceipt({ ...baseOptions, artifactPaths: ["linked.apk"] }),
    /cannot be a symlink/,
  );
  await assert.rejects(
    buildNativeArtifactReceipt({
      ...baseOptions,
      artifactPaths: ["linked-directory/nested.apk"],
    }),
    /cannot traverse a symlink/,
  );
  await assert.rejects(
    buildNativeArtifactReceipt({
      ...baseOptions,
      artifactPaths: [join(outsideRoot, "outside.apk")],
    }),
    /must stay inside the project root/,
  );
  await assert.rejects(
    writeNativeArtifactReceipt({
      ...baseOptions,
      outputPath: "linked-directory/receipt.json",
      artifactPaths: ["app.apk"],
    }),
    /Receipt directory cannot traverse a symlink/,
  );
});
