import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeNativeArtifactReceipt } from "./native-artifact-receipt.mjs";
import {
  approvalPublicKeyFingerprint,
  createApprovalSignature,
  validateNativeReleasePolicy,
  verifyNativeReleasePromotion,
  writeNativeReleasePromotion,
} from "./verify-native-release-promotion.mjs";

const REVISION = "a".repeat(40);
const SIGNING_KEYS = generateKeyPairSync("ed25519");
const ACCEPTANCE_KEYS = generateKeyPairSync("ed25519");
const NOW = new Date("2026-08-03T13:00:00.000Z");
const REPOSITORY_POLICY_PATH = fileURLToPath(
  new URL("../config/native-release-promotion.json", import.meta.url),
);
const TOOLCHAIN = {
  node: "24.18.1",
  pnpm: "11.18.0",
  rust: "1.97.1",
  lockfileSha256: "0".repeat(64),
};
const POLICY = {
  schema: "epiton.native-release-policy.v1",
  repository: "gabriel2320/epiton",
  ref: "refs/heads/main",
  maxEvidenceAgeDays: 30,
  approvalAuthorities: {
    signingPublicKeyFingerprintSha256: approvalPublicKeyFingerprint(SIGNING_KEYS.publicKey),
    deviceAcceptancePublicKeyFingerprintSha256: approvalPublicKeyFingerprint(
      ACCEPTANCE_KEYS.publicKey,
    ),
  },
  candidates: {
    "android-release-candidate": {
      platform: "android",
      formats: ["android-apk"],
      signingMethod: "android-apksigner",
      requiredScenarios: [
        "install-clean",
        "launch",
        "login-logout",
        "restart-requires-login",
        "os-backup-disabled",
        "legacy-session-deleted",
        "no-session-persistence",
      ],
    },
    "linux-release-candidate": {
      platform: "linux",
      formats: ["appimage", "debian-package"],
      signingMethod: "linux-detached-signature",
      requiredScenarios: [
        "install-deb",
        "launch-appimage",
        "login-logout",
        "restart-requires-login",
        "legacy-session-deleted",
        "no-session-persistence",
      ],
    },
  },
};
const CI_ENV = {
  GITHUB_ACTIONS: "true",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: POLICY.repository,
  GITHUB_REF: POLICY.ref,
  GITHUB_RUN_ID: "42",
  GITHUB_RUN_ATTEMPT: "1",
};

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "epiton-native-promotion-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function evidenceArtifacts(receipt) {
  return receipt.artifacts.map(({ path, sha256 }) => ({ path, sha256 }));
}

function signingEvidence(platform, receipt) {
  const value = {
    schema: "epiton.native-signing-evidence.v1",
    platform,
    revision: REVISION,
    verifiedAt: "2026-08-03T12:05:00.000Z",
    authority: "release-signing-role",
    method: POLICY.candidates[receipt.kind].signingMethod,
    signerFingerprintSha256: "1".repeat(64),
    verificationOutputSha256: "2".repeat(64),
    buildAttestationUrl: `https://github.com/${POLICY.repository}/attestations/1234`,
    verified: true,
    artifacts: evidenceArtifacts(receipt),
    approvalKeyFingerprintSha256: POLICY.approvalAuthorities.signingPublicKeyFingerprintSha256,
  };
  return {
    ...value,
    approvalSignature: createApprovalSignature(value, SIGNING_KEYS.privateKey),
  };
}

function deviceAcceptance(platform, receipt) {
  const candidate = POLICY.candidates[receipt.kind];
  const value = {
    schema: "epiton.native-device-acceptance.v1",
    platform,
    revision: REVISION,
    acceptedAt: "2026-08-03T12:10:00.000Z",
    authority: "native-acceptance-role",
    device: {
      class: "physical",
      os: platform === "android" ? "Android" : "Ubuntu",
      osVersion: platform === "android" ? "16" : "24.04 LTS",
      model: platform === "android" ? "synthetic-test-handset" : "synthetic-test-workstation",
    },
    artifacts: evidenceArtifacts(receipt),
    scenarios: candidate.requiredScenarios.map((id) => ({ id, passed: true })),
    productionDataUsed: false,
    accepted: true,
    approvalKeyFingerprintSha256:
      POLICY.approvalAuthorities.deviceAcceptancePublicKeyFingerprintSha256,
  };
  return {
    ...value,
    approvalSignature: createApprovalSignature(value, ACCEPTANCE_KEYS.privateKey),
  };
}

async function writeJson(projectRoot, path, value) {
  await mkdir(dirname(join(projectRoot, path)), { recursive: true });
  await writeFile(join(projectRoot, path), `${JSON.stringify(value, null, 2)}\n`);
}

async function releaseFixture(t) {
  const projectRoot = await fixtureRoot(t);
  await Promise.all([
    mkdir(join(projectRoot, "config"), { recursive: true }),
    mkdir(join(projectRoot, "dist/android"), { recursive: true }),
    mkdir(join(projectRoot, "dist/linux"), { recursive: true }),
  ]);
  await Promise.all([
    writeJson(projectRoot, "config/native-release-promotion.json", POLICY),
    writeFile(join(projectRoot, "dist/android/epiton-release.apk"), "signed-android-release"),
    writeFile(join(projectRoot, "dist/linux/epiton.deb"), "signed-linux-deb"),
    writeFile(join(projectRoot, "dist/linux/Epiton.AppImage"), "signed-linux-appimage"),
  ]);
  const common = {
    projectRoot,
    revision: REVISION,
    workingTreeDirty: false,
    now: () => new Date("2026-08-03T12:00:00.000Z"),
    env: CI_ENV,
    toolchain: TOOLCHAIN,
  };
  const android = await writeNativeArtifactReceipt({
    ...common,
    kind: "android-release-candidate",
    outputPath: ".artifacts/native/android-release/receipt.json",
    artifactPaths: ["dist/android/epiton-release.apk"],
  });
  const linux = await writeNativeArtifactReceipt({
    ...common,
    kind: "linux-release-candidate",
    outputPath: ".artifacts/native/linux-release/receipt.json",
    artifactPaths: ["dist/linux/epiton.deb", "dist/linux/Epiton.AppImage"],
  });
  const signing = {
    android: signingEvidence("android", android.receipt),
    linux: signingEvidence("linux", linux.receipt),
  };
  const acceptance = {
    android: deviceAcceptance("android", android.receipt),
    linux: deviceAcceptance("linux", linux.receipt),
  };
  const paths = {
    receipts: [
      ".artifacts/native/linux-release/receipt.json",
      ".artifacts/native/android-release/receipt.json",
    ],
    signing: [
      ".artifacts/native/evidence/linux-signing.json",
      ".artifacts/native/evidence/android-signing.json",
    ],
    acceptance: [
      ".artifacts/native/evidence/android-device.json",
      ".artifacts/native/evidence/linux-device.json",
    ],
  };
  await Promise.all([
    writeJson(projectRoot, paths.signing[1], signing.android),
    writeJson(projectRoot, paths.signing[0], signing.linux),
    writeJson(projectRoot, paths.acceptance[0], acceptance.android),
    writeJson(projectRoot, paths.acceptance[1], acceptance.linux),
  ]);
  const options = {
    projectRoot,
    policyPath: "config/native-release-promotion.json",
    receiptPaths: paths.receipts,
    signingEvidencePaths: paths.signing,
    deviceAcceptancePaths: paths.acceptance,
    signingPublicKey: SIGNING_KEYS.publicKey,
    acceptancePublicKey: ACCEPTANCE_KEYS.publicKey,
    now: () => NOW,
    revision: REVISION,
    workingTreeDirty: false,
    toolchain: TOOLCHAIN,
  };
  return { projectRoot, android, linux, signing, acceptance, paths, options };
}

test("promotes only the exact signed and physically accepted native artifact set", async (t) => {
  const fixture = await releaseFixture(t);
  const result = await writeNativeReleasePromotion({
    ...fixture.options,
    outputPath: ".artifacts/native/promotion/receipt.json",
  });

  assert.equal(result.receipt.schema, "epiton.native-release-promotion.v1");
  assert.equal(result.receipt.scope, "native-artifact-distribution");
  assert.equal(result.receipt.productionEligible, true);
  assert.deepEqual(
    result.receipt.candidates.map(({ platform }) => platform),
    ["android", "linux"],
  );
  assert.equal(JSON.parse(await readFile(result.receiptPath, "utf8")).revision, REVISION);
  const checksumSource = await readFile(result.checksumPath, "utf8");
  assert.match(checksumSource, new RegExp(digest("signed-android-release")));
  assert.match(checksumSource, /\.artifacts\/native\/promotion\/receipt\.json/);
});

test("rejects debug or unsigned receipts as release candidates", async (t) => {
  const fixture = await releaseFixture(t);
  const source = JSON.parse(await readFile(fixture.android.receiptPath, "utf8"));
  source.kind = "android-debug";
  await writeJson(fixture.projectRoot, fixture.paths.receipts[1], source);

  await assert.rejects(
    verifyNativeReleasePromotion(fixture.options),
    /Unknown candidate receipt kind/,
  );
});

test("rejects a changed artifact even when the original receipt still exists", async (t) => {
  const fixture = await releaseFixture(t);
  await writeFile(join(fixture.projectRoot, "dist/android/epiton-release.apk"), "tampered");

  await assert.rejects(verifyNativeReleasePromotion(fixture.options), /byte size does not match/);
});

test("rejects signing evidence changed after approval", async (t) => {
  const fixture = await releaseFixture(t);
  fixture.signing.android.authority = "unexpected-authority";
  await writeJson(fixture.projectRoot, fixture.paths.signing[1], fixture.signing.android);

  await assert.rejects(
    verifyNativeReleasePromotion(fixture.options),
    /approvalSignature does not match/,
  );
});

test("rejects missing physical acceptance scenarios even with a valid approval", async (t) => {
  const fixture = await releaseFixture(t);
  const value = fixture.acceptance.linux;
  value.scenarios = value.scenarios.slice(1);
  value.approvalSignature = createApprovalSignature(value, ACCEPTANCE_KEYS.privateKey);
  await writeJson(fixture.projectRoot, fixture.paths.acceptance[1], value);

  await assert.rejects(verifyNativeReleasePromotion(fixture.options), /required closed set/);
});

test("rejects device acceptance that used production data", async (t) => {
  const fixture = await releaseFixture(t);
  const value = fixture.acceptance.android;
  value.productionDataUsed = true;
  value.approvalSignature = createApprovalSignature(value, ACCEPTANCE_KEYS.privateKey);
  await writeJson(fixture.projectRoot, fixture.paths.acceptance[0], value);

  await assert.rejects(
    verifyNativeReleasePromotion(fixture.options),
    /no production data was used/,
  );
});

test("rejects stale evidence and acceptance predating signature verification", async (t) => {
  const fixture = await releaseFixture(t);
  const stale = fixture.signing.linux;
  stale.verifiedAt = "2026-06-01T12:05:00.000Z";
  stale.approvalSignature = createApprovalSignature(stale, SIGNING_KEYS.privateKey);
  await writeJson(fixture.projectRoot, fixture.paths.signing[0], stale);
  await assert.rejects(verifyNativeReleasePromotion(fixture.options), /older than policy allows/);

  const freshFixture = await releaseFixture(t);
  const early = freshFixture.acceptance.android;
  early.acceptedAt = "2026-08-03T12:01:00.000Z";
  early.approvalSignature = createApprovalSignature(early, ACCEPTANCE_KEYS.privateKey);
  await writeJson(freshFixture.projectRoot, freshFixture.paths.acceptance[0], early);
  await assert.rejects(
    verifyNativeReleasePromotion(freshFixture.options),
    /predates signing verification/,
  );
});

test("rejects a dirty release checkout and a weakened policy", async (t) => {
  const fixture = await releaseFixture(t);
  await assert.rejects(
    verifyNativeReleasePromotion({ ...fixture.options, workingTreeDirty: true }),
    /requires a clean checkout/,
  );

  const weakened = structuredClone(POLICY);
  weakened.candidates["android-release-candidate"].requiredScenarios.pop();
  await writeJson(fixture.projectRoot, "config/native-release-promotion.json", weakened);
  await assert.rejects(verifyNativeReleasePromotion(fixture.options), /required closed set/);
});

test("requires pinned, distinct Ed25519 approval authorities", async (t) => {
  const fixture = await releaseFixture(t);
  await assert.rejects(
    verifyNativeReleasePromotion({ ...fixture.options, signingPublicKey: "not-a-public-key" }),
    /valid Ed25519 public key/,
  );
  await assert.rejects(
    verifyNativeReleasePromotion({
      ...fixture.options,
      acceptancePublicKey: SIGNING_KEYS.publicKey,
    }),
    /does not match the trusted policy fingerprint/,
  );

  const weakened = structuredClone(POLICY);
  weakened.approvalAuthorities.deviceAcceptancePublicKeyFingerprintSha256 =
    weakened.approvalAuthorities.signingPublicKeyFingerprintSha256;
  await writeJson(fixture.projectRoot, "config/native-release-promotion.json", weakened);
  await assert.rejects(verifyNativeReleasePromotion(fixture.options), /must be different/);

  const unconfiguredFixture = await releaseFixture(t);
  const unconfigured = structuredClone(POLICY);
  unconfigured.approvalAuthorities.signingPublicKeyFingerprintSha256 = "UNCONFIGURED";
  await writeJson(
    unconfiguredFixture.projectRoot,
    "config/native-release-promotion.json",
    unconfigured,
  );
  await assert.rejects(
    verifyNativeReleasePromotion(unconfiguredFixture.options),
    /public keys are not configured/,
  );
});

test("ships a valid repository policy with fail-closed trust roots", async () => {
  const policy = JSON.parse(await readFile(REPOSITORY_POLICY_PATH, "utf8"));
  assert.doesNotThrow(() => validateNativeReleasePolicy(policy));
  assert.equal(policy.approvalAuthorities.signingPublicKeyFingerprintSha256, "UNCONFIGURED");
  assert.equal(
    policy.approvalAuthorities.deviceAcceptancePublicKeyFingerprintSha256,
    "UNCONFIGURED",
  );
});

test("never overwrites a release input or its checksum manifest", async (t) => {
  const fixture = await releaseFixture(t);
  await assert.rejects(
    writeNativeReleasePromotion({
      ...fixture.options,
      outputPath: fixture.paths.signing[0],
    }),
    /cannot overwrite release inputs/,
  );
  await assert.rejects(
    writeNativeReleasePromotion({
      ...fixture.options,
      outputPath: ".artifacts/native/android-release/promotion.json",
    }),
    /cannot overwrite release inputs/,
  );
});
