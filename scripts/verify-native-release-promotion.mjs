import { execFile } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { ARTIFACT_POLICIES, loadToolchain, sha256File } from "./native-artifact-receipt.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const UNCONFIGURED_FINGERPRINT = "UNCONFIGURED";
const REQUIRED_CANDIDATES = {
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
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expectedKeys, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function exactStringSet(actual, expected, label) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  if (new Set(actual).size !== actual.length) throw new Error(`${label} cannot contain duplicates`);
  if (!isDeepStrictEqual([...actual].sort(), [...expected].sort())) {
    throw new Error(`${label} does not match the required closed set`);
  }
}

function projectRelative(projectRoot, absolutePath) {
  const value = relative(projectRoot, absolutePath);
  if (!value || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new Error(`Path must stay inside the project root: ${absolutePath}`);
  }
  return value.split(sep).join("/");
}

async function regularFileWithinRoot(projectRoot, inputPath, label) {
  const absolutePath = resolve(projectRoot, inputPath);
  projectRelative(projectRoot, absolutePath);
  const fileInfo = await lstat(absolutePath);
  if (fileInfo.isSymbolicLink()) throw new Error(`${label} cannot be a symlink: ${inputPath}`);
  if (!fileInfo.isFile()) throw new Error(`${label} must be a regular file: ${inputPath}`);
  const canonicalPath = await realpath(absolutePath);
  projectRelative(projectRoot, canonicalPath);
  if (canonicalPath !== absolutePath) {
    throw new Error(`${label} path cannot traverse a symlink: ${inputPath}`);
  }
  return absolutePath;
}

async function readJsonWithinRoot(projectRoot, inputPath, label) {
  const absolutePath = await regularFileWithinRoot(projectRoot, inputPath, label);
  const source = await readFile(absolutePath, "utf8");
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON: ${inputPath}`);
  }
  return {
    absolutePath,
    path: projectRelative(projectRoot, absolutePath),
    sha256: createHash("sha256").update(source).digest("hex"),
    source,
    value,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function approvalPayload(value) {
  const { approvalSignature: _approvalSignature, ...payload } = value;
  return JSON.stringify(canonicalize(payload));
}

function ed25519PublicKey(key, label) {
  let parsed;
  try {
    parsed =
      key?.type === "public" && typeof key.export === "function" ? key : createPublicKey(key);
  } catch {
    throw new Error(`${label} must be a valid Ed25519 public key`);
  }
  if (parsed.asymmetricKeyType !== "ed25519") {
    throw new Error(`${label} must be an Ed25519 public key`);
  }
  return parsed;
}

export function approvalPublicKeyFingerprint(key) {
  const publicKey = ed25519PublicKey(key, "Approval public key");
  return createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
}

function ed25519PrivateKey(key) {
  let parsed;
  try {
    parsed =
      key?.type === "private" && typeof key.export === "function" ? key : createPrivateKey(key);
  } catch {
    throw new Error("Approval private key must be a valid Ed25519 private key");
  }
  if (parsed.asymmetricKeyType !== "ed25519") {
    throw new Error("Approval private key must be an Ed25519 private key");
  }
  return parsed;
}

export function createApprovalSignature(value, privateKey) {
  return sign(null, Buffer.from(approvalPayload(value)), ed25519PrivateKey(privateKey)).toString(
    "base64",
  );
}

function trustedApprovalKey(key, expectedFingerprint, label) {
  const publicKey = ed25519PublicKey(key, `${label} public key`);
  const actualFingerprint = approvalPublicKeyFingerprint(publicKey);
  if (actualFingerprint !== expectedFingerprint) {
    throw new Error(`${label} public key does not match the trusted policy fingerprint`);
  }
  return publicKey;
}

function verifyApprovalSignature(value, publicKey, expectedFingerprint, label) {
  if (value.approvalKeyFingerprintSha256 !== expectedFingerprint) {
    throw new Error(`${label} approval key fingerprint does not match policy`);
  }
  if (!/^[A-Za-z0-9+/]{86}==$/.test(value.approvalSignature)) {
    throw new Error(`${label} approvalSignature is invalid`);
  }
  const signature = Buffer.from(value.approvalSignature, "base64");
  if (
    signature.length !== 64 ||
    !verify(null, Buffer.from(approvalPayload(value)), publicKey, signature)
  ) {
    throw new Error(`${label} approvalSignature does not match`);
  }
}

function parseTimestamp(value, label, nowMs, maxAgeMs) {
  nonEmptyString(value, label);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  if (timestamp > nowMs + FUTURE_TOLERANCE_MS) throw new Error(`${label} is in the future`);
  if (nowMs - timestamp > maxAgeMs) throw new Error(`${label} is older than policy allows`);
  return timestamp;
}

export function validateNativeReleasePolicy(policy) {
  exactKeys(
    policy,
    ["schema", "repository", "ref", "maxEvidenceAgeDays", "approvalAuthorities", "candidates"],
    "Native release policy",
  );
  if (policy.schema !== "epiton.native-release-policy.v1") {
    throw new Error("Unsupported native release policy schema");
  }
  nonEmptyString(policy.repository, "Policy repository");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(policy.repository)) {
    throw new Error("Policy repository must be an owner/name pair");
  }
  nonEmptyString(policy.ref, "Policy ref");
  if (!policy.ref.startsWith("refs/heads/")) throw new Error("Policy ref must be a branch ref");
  if (
    !Number.isInteger(policy.maxEvidenceAgeDays) ||
    policy.maxEvidenceAgeDays < 1 ||
    policy.maxEvidenceAgeDays > 90
  ) {
    throw new Error("Policy maxEvidenceAgeDays must be between 1 and 90");
  }
  exactKeys(
    policy.approvalAuthorities,
    ["signingPublicKeyFingerprintSha256", "deviceAcceptancePublicKeyFingerprintSha256"],
    "Policy approval authorities",
  );
  const signingFingerprint = policy.approvalAuthorities.signingPublicKeyFingerprintSha256;
  const acceptanceFingerprint =
    policy.approvalAuthorities.deviceAcceptancePublicKeyFingerprintSha256;
  for (const [fingerprint, label] of [
    [signingFingerprint, "Policy signing public key fingerprint"],
    [acceptanceFingerprint, "Policy device acceptance public key fingerprint"],
  ]) {
    if (fingerprint !== UNCONFIGURED_FINGERPRINT && !SHA256_PATTERN.test(fingerprint)) {
      throw new Error(`${label} must be SHA-256 or UNCONFIGURED`);
    }
  }
  if (
    signingFingerprint !== UNCONFIGURED_FINGERPRINT &&
    signingFingerprint === acceptanceFingerprint
  ) {
    throw new Error("Policy approval authority public keys must be different");
  }
  exactKeys(policy.candidates, Object.keys(REQUIRED_CANDIDATES), "Policy candidates");
  for (const [kind, baseline] of Object.entries(REQUIRED_CANDIDATES)) {
    const candidate = policy.candidates[kind];
    exactKeys(
      candidate,
      ["platform", "formats", "signingMethod", "requiredScenarios"],
      `Policy candidate ${kind}`,
    );
    if (candidate.platform !== baseline.platform) throw new Error(`Wrong platform for ${kind}`);
    if (candidate.signingMethod !== baseline.signingMethod) {
      throw new Error(`Wrong signing method for ${kind}`);
    }
    exactStringSet(candidate.formats, baseline.formats, `${kind} formats`);
    exactStringSet(
      candidate.requiredScenarios,
      baseline.requiredScenarios,
      `${kind} requiredScenarios`,
    );
  }
}

function configuredApprovalFingerprints(policy) {
  const signingFingerprint = policy.approvalAuthorities.signingPublicKeyFingerprintSha256;
  const acceptanceFingerprint =
    policy.approvalAuthorities.deviceAcceptancePublicKeyFingerprintSha256;
  if (
    signingFingerprint === UNCONFIGURED_FINGERPRINT ||
    acceptanceFingerprint === UNCONFIGURED_FINGERPRINT
  ) {
    throw new Error("Native release approval authority public keys are not configured");
  }
  return { signingFingerprint, acceptanceFingerprint };
}

function validateCi(ci, policy, label) {
  exactKeys(
    ci,
    ["provider", "repository", "ref", "runId", "runAttempt", "runUrl"],
    `${label} CI metadata`,
  );
  if (ci.provider !== "github-actions") throw new Error(`${label} must come from GitHub Actions`);
  if (ci.repository !== policy.repository)
    throw new Error(`${label} repository does not match policy`);
  if (ci.ref !== policy.ref) throw new Error(`${label} ref does not match policy`);
  if (!/^\d+$/.test(ci.runId ?? "")) throw new Error(`${label} runId is invalid`);
  if (!/^\d+$/.test(ci.runAttempt ?? "")) throw new Error(`${label} runAttempt is invalid`);
  const expectedUrl = `https://github.com/${policy.repository}/actions/runs/${ci.runId}`;
  if (ci.runUrl !== expectedUrl) throw new Error(`${label} runUrl is invalid`);
}

function validateArtifacts(artifacts, candidate, label) {
  if (!Array.isArray(artifacts) || artifacts.length !== candidate.formats.length) {
    throw new Error(`${label} must contain exactly one artifact per required format`);
  }
  const paths = new Set();
  const formats = [];
  for (const [index, artifact] of artifacts.entries()) {
    exactKeys(artifact, ["path", "format", "bytes", "sha256"], `${label} artifact ${index}`);
    nonEmptyString(artifact.path, `${label} artifact path`);
    if (artifact.path.startsWith("/") || artifact.path.includes("\\")) {
      throw new Error(`${label} artifact path must be repository-relative POSIX syntax`);
    }
    if (paths.has(artifact.path)) throw new Error(`${label} contains duplicate artifact paths`);
    paths.add(artifact.path);
    formats.push(artifact.format);
    if (!Number.isInteger(artifact.bytes) || artifact.bytes <= 0) {
      throw new Error(`${label} artifact bytes must be positive`);
    }
    if (!SHA256_PATTERN.test(artifact.sha256))
      throw new Error(`${label} artifact SHA-256 is invalid`);
  }
  exactStringSet(formats, candidate.formats, `${label} artifact formats`);
  const sortedPaths = [...paths].sort();
  if (!isDeepStrictEqual([...paths], sortedPaths)) {
    throw new Error(`${label} artifact paths must be sorted`);
  }
}

function validateCandidateReceipt({
  receipt,
  kind,
  candidate,
  policy,
  revision,
  toolchain,
  nowMs,
}) {
  const label = `${kind} receipt`;
  exactKeys(
    receipt,
    [
      "schema",
      "generatedAt",
      "kind",
      "revision",
      "workingTreeDirty",
      "ci",
      "signing",
      "toolchain",
      "artifacts",
    ],
    label,
  );
  if (receipt.schema !== "epiton.native-artifacts.v1")
    throw new Error(`${label} schema is invalid`);
  if (receipt.kind !== kind) throw new Error(`${label} kind does not match`);
  if (!REVISION_PATTERN.test(receipt.revision) || receipt.revision !== revision) {
    throw new Error(`${label} revision does not match the release checkout`);
  }
  if (receipt.workingTreeDirty !== false)
    throw new Error(`${label} must come from a clean checkout`);
  validateCi(receipt.ci, policy, label);
  exactKeys(
    receipt.signing,
    ["status", "productionEligible", "requiredPromotionGate"],
    `${label} signing policy`,
  );
  if (!isDeepStrictEqual(receipt.signing, ARTIFACT_POLICIES[kind].signing)) {
    throw new Error(`${label} signing policy was weakened or changed`);
  }
  if (!isDeepStrictEqual(receipt.toolchain, toolchain)) {
    throw new Error(`${label} toolchain does not match the pinned release checkout`);
  }
  validateArtifacts(receipt.artifacts, candidate, label);
  return parseTimestamp(
    receipt.generatedAt,
    `${label} generatedAt`,
    nowMs,
    policy.maxEvidenceAgeDays * 86_400_000,
  );
}

function parseChecksumManifest(source, label) {
  const records = new Map();
  for (const line of source.split("\n")) {
    if (!line) continue;
    const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (!match) throw new Error(`${label} contains an invalid checksum line`);
    if (records.has(match[2])) throw new Error(`${label} contains a duplicate path`);
    records.set(match[2], match[1]);
  }
  return records;
}

async function verifyCandidateFiles(projectRoot, receiptFile, receipt) {
  const checksumPath = resolve(dirname(receiptFile.absolutePath), "SHA256SUMS");
  const safeChecksumPath = await regularFileWithinRoot(
    projectRoot,
    checksumPath,
    `${receipt.kind} checksum manifest`,
  );
  const checksumRecords = parseChecksumManifest(
    await readFile(safeChecksumPath, "utf8"),
    `${receipt.kind} checksum manifest`,
  );
  const expectedPaths = new Set([receiptFile.path, ...receipt.artifacts.map(({ path }) => path)]);
  if (!isDeepStrictEqual([...checksumRecords.keys()].sort(), [...expectedPaths].sort())) {
    throw new Error(
      `${receipt.kind} checksum manifest does not exactly cover its receipt and artifacts`,
    );
  }
  if (checksumRecords.get(receiptFile.path) !== receiptFile.sha256) {
    throw new Error(`${receipt.kind} receipt checksum does not match`);
  }
  for (const artifact of receipt.artifacts) {
    const artifactPath = await regularFileWithinRoot(
      projectRoot,
      artifact.path,
      `${receipt.kind} artifact`,
    );
    const fileInfo = await stat(artifactPath);
    if (fileInfo.size !== artifact.bytes)
      throw new Error(`${artifact.path} byte size does not match`);
    const digest = await sha256File(artifactPath);
    if (digest !== artifact.sha256 || checksumRecords.get(artifact.path) !== digest) {
      throw new Error(`${artifact.path} SHA-256 does not match`);
    }
  }
}

function validateEvidenceArtifacts(artifacts, receiptArtifacts, label) {
  if (!Array.isArray(artifacts)) throw new Error(`${label} artifacts must be an array`);
  const expected = receiptArtifacts.map(({ path, sha256 }) => ({ path, sha256 }));
  for (const [index, artifact] of artifacts.entries()) {
    exactKeys(artifact, ["path", "sha256"], `${label} artifact ${index}`);
  }
  if (!isDeepStrictEqual(artifacts, expected)) {
    throw new Error(`${label} artifacts do not exactly match the candidate receipt`);
  }
}

function validateAttestationUrl(value, repository, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} buildAttestationUrl is invalid`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !url.pathname.startsWith(`/${repository}/attestations/`)
  ) {
    throw new Error(`${label} buildAttestationUrl must reference the policy repository`);
  }
}

function validateSigningEvidence({
  evidence,
  platform,
  candidate,
  receipt,
  policy,
  signingPublicKey,
  signingFingerprint,
  generatedAtMs,
  nowMs,
}) {
  const label = `${platform} signing evidence`;
  exactKeys(
    evidence,
    [
      "schema",
      "platform",
      "revision",
      "verifiedAt",
      "authority",
      "method",
      "signerFingerprintSha256",
      "verificationOutputSha256",
      "buildAttestationUrl",
      "verified",
      "artifacts",
      "approvalKeyFingerprintSha256",
      "approvalSignature",
    ],
    label,
  );
  if (evidence.schema !== "epiton.native-signing-evidence.v1") {
    throw new Error(`${label} schema is invalid`);
  }
  if (evidence.platform !== platform || evidence.revision !== receipt.revision) {
    throw new Error(`${label} does not match the candidate`);
  }
  nonEmptyString(evidence.authority, `${label} authority`);
  if (evidence.method !== candidate.signingMethod) throw new Error(`${label} method is invalid`);
  if (!SHA256_PATTERN.test(evidence.signerFingerprintSha256)) {
    throw new Error(`${label} signer fingerprint is invalid`);
  }
  if (!SHA256_PATTERN.test(evidence.verificationOutputSha256)) {
    throw new Error(`${label} verification output digest is invalid`);
  }
  validateAttestationUrl(evidence.buildAttestationUrl, policy.repository, label);
  if (evidence.verified !== true) throw new Error(`${label} must be explicitly verified`);
  validateEvidenceArtifacts(evidence.artifacts, receipt.artifacts, label);
  const verifiedAtMs = parseTimestamp(
    evidence.verifiedAt,
    `${label} verifiedAt`,
    nowMs,
    policy.maxEvidenceAgeDays * 86_400_000,
  );
  if (verifiedAtMs < generatedAtMs) throw new Error(`${label} predates the candidate receipt`);
  verifyApprovalSignature(evidence, signingPublicKey, signingFingerprint, label);
  return verifiedAtMs;
}

function validateDeviceAcceptance({
  acceptance,
  platform,
  candidate,
  receipt,
  policy,
  acceptancePublicKey,
  acceptanceFingerprint,
  verifiedAtMs,
  nowMs,
}) {
  const label = `${platform} device acceptance`;
  exactKeys(
    acceptance,
    [
      "schema",
      "platform",
      "revision",
      "acceptedAt",
      "authority",
      "device",
      "artifacts",
      "scenarios",
      "productionDataUsed",
      "accepted",
      "approvalKeyFingerprintSha256",
      "approvalSignature",
    ],
    label,
  );
  if (acceptance.schema !== "epiton.native-device-acceptance.v1") {
    throw new Error(`${label} schema is invalid`);
  }
  if (acceptance.platform !== platform || acceptance.revision !== receipt.revision) {
    throw new Error(`${label} does not match the candidate`);
  }
  nonEmptyString(acceptance.authority, `${label} authority`);
  exactKeys(acceptance.device, ["class", "os", "osVersion", "model"], `${label} device`);
  if (acceptance.device.class !== "physical")
    throw new Error(`${label} requires a physical device`);
  nonEmptyString(acceptance.device.os, `${label} device os`);
  nonEmptyString(acceptance.device.osVersion, `${label} device osVersion`);
  nonEmptyString(acceptance.device.model, `${label} device model`);
  validateEvidenceArtifacts(acceptance.artifacts, receipt.artifacts, label);
  if (!Array.isArray(acceptance.scenarios)) throw new Error(`${label} scenarios must be an array`);
  const scenarioIds = [];
  for (const [index, scenario] of acceptance.scenarios.entries()) {
    exactKeys(scenario, ["id", "passed"], `${label} scenario ${index}`);
    nonEmptyString(scenario.id, `${label} scenario id`);
    if (scenario.passed !== true) throw new Error(`${label} scenario ${scenario.id} did not pass`);
    scenarioIds.push(scenario.id);
  }
  exactStringSet(scenarioIds, candidate.requiredScenarios, `${label} scenarios`);
  if (acceptance.productionDataUsed !== false) {
    throw new Error(`${label} must explicitly confirm that no production data was used`);
  }
  if (acceptance.accepted !== true) throw new Error(`${label} must be explicitly accepted`);
  const acceptedAtMs = parseTimestamp(
    acceptance.acceptedAt,
    `${label} acceptedAt`,
    nowMs,
    policy.maxEvidenceAgeDays * 86_400_000,
  );
  if (acceptedAtMs < verifiedAtMs) throw new Error(`${label} predates signing verification`);
  verifyApprovalSignature(acceptance, acceptancePublicKey, acceptanceFingerprint, label);
}

function evidenceByPlatform(files, expectedPlatforms, label) {
  if (files.length !== expectedPlatforms.length) {
    throw new Error(`${label} requires exactly one file per platform`);
  }
  const result = new Map();
  for (const file of files) {
    const platform = file.value?.platform;
    if (!expectedPlatforms.includes(platform)) throw new Error(`${label} has an unknown platform`);
    if (result.has(platform)) throw new Error(`${label} has duplicate ${platform} evidence`);
    result.set(platform, file);
  }
  return result;
}

async function resolveRevision(projectRoot) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return stdout.trim();
}

async function resolveWorkingTreeDirty(projectRoot) {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return stdout.trim().length > 0;
}

export async function verifyNativeReleasePromotion({
  projectRoot,
  policyPath,
  receiptPaths,
  signingEvidencePaths,
  deviceAcceptancePaths,
  signingPublicKey,
  acceptancePublicKey,
  now = () => new Date(),
  revision,
  workingTreeDirty,
  toolchain,
}) {
  const resolvedRoot = await realpath(projectRoot);
  const policyFile = await readJsonWithinRoot(resolvedRoot, policyPath, "Native release policy");
  const policy = policyFile.value;
  validateNativeReleasePolicy(policy);
  const resolvedRevision = revision ?? (await resolveRevision(resolvedRoot));
  if (!REVISION_PATTERN.test(resolvedRevision))
    throw new Error("Release revision must be a full Git SHA");
  const dirty = workingTreeDirty ?? (await resolveWorkingTreeDirty(resolvedRoot));
  if (dirty) throw new Error("Native release promotion requires a clean checkout");
  const expectedToolchain = toolchain ?? (await loadToolchain(resolvedRoot));
  const nowDate = now();
  const nowMs = nowDate.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Promotion clock is invalid");
  const approvalFingerprints = configuredApprovalFingerprints(policy);
  const approvalKeys = {
    signingPublicKey: trustedApprovalKey(
      signingPublicKey,
      approvalFingerprints.signingFingerprint,
      "Signing approval",
    ),
    acceptancePublicKey: trustedApprovalKey(
      acceptancePublicKey,
      approvalFingerprints.acceptanceFingerprint,
      "Device acceptance approval",
    ),
  };

  if (receiptPaths.length !== Object.keys(policy.candidates).length) {
    throw new Error("Promotion requires exactly one receipt per release candidate");
  }
  const receiptFiles = await Promise.all(
    receiptPaths.map((path) => readJsonWithinRoot(resolvedRoot, path, "Candidate receipt")),
  );
  const receiptsByKind = new Map();
  for (const file of receiptFiles) {
    const kind = file.value?.kind;
    if (!Object.hasOwn(policy.candidates, kind)) throw new Error("Unknown candidate receipt kind");
    if (receiptsByKind.has(kind)) throw new Error(`Duplicate ${kind} receipt`);
    receiptsByKind.set(kind, file);
  }
  for (const kind of Object.keys(policy.candidates)) {
    if (!receiptsByKind.has(kind)) throw new Error(`Missing ${kind} receipt`);
  }

  const signingFiles = await Promise.all(
    signingEvidencePaths.map((path) => readJsonWithinRoot(resolvedRoot, path, "Signing evidence")),
  );
  const acceptanceFiles = await Promise.all(
    deviceAcceptancePaths.map((path) =>
      readJsonWithinRoot(resolvedRoot, path, "Device acceptance"),
    ),
  );
  const platforms = Object.values(policy.candidates).map(({ platform }) => platform);
  const signingByPlatform = evidenceByPlatform(signingFiles, platforms, "Signing evidence");
  const acceptanceByPlatform = evidenceByPlatform(acceptanceFiles, platforms, "Device acceptance");

  const promotionCandidates = [];
  for (const [kind, candidate] of Object.entries(policy.candidates)) {
    const receiptFile = receiptsByKind.get(kind);
    const receipt = receiptFile.value;
    const generatedAtMs = validateCandidateReceipt({
      receipt,
      kind,
      candidate,
      policy,
      revision: resolvedRevision,
      toolchain: expectedToolchain,
      nowMs,
    });
    await verifyCandidateFiles(resolvedRoot, receiptFile, receipt);
    const signingFile = signingByPlatform.get(candidate.platform);
    const acceptanceFile = acceptanceByPlatform.get(candidate.platform);
    const verifiedAtMs = validateSigningEvidence({
      evidence: signingFile.value,
      platform: candidate.platform,
      candidate,
      receipt,
      policy,
      signingPublicKey: approvalKeys.signingPublicKey,
      signingFingerprint: approvalFingerprints.signingFingerprint,
      generatedAtMs,
      nowMs,
    });
    validateDeviceAcceptance({
      acceptance: acceptanceFile.value,
      platform: candidate.platform,
      candidate,
      receipt,
      policy,
      acceptancePublicKey: approvalKeys.acceptancePublicKey,
      acceptanceFingerprint: approvalFingerprints.acceptanceFingerprint,
      verifiedAtMs,
      nowMs,
    });
    promotionCandidates.push({
      kind,
      platform: candidate.platform,
      receipt: { path: receiptFile.path, sha256: receiptFile.sha256 },
      signingEvidence: { path: signingFile.path, sha256: signingFile.sha256 },
      deviceAcceptance: { path: acceptanceFile.path, sha256: acceptanceFile.sha256 },
      artifacts: receipt.artifacts.map(({ path, format, bytes, sha256 }) => ({
        path,
        format,
        bytes,
        sha256,
      })),
    });
  }

  return {
    schema: "epiton.native-release-promotion.v1",
    generatedAt: nowDate.toISOString(),
    scope: "native-artifact-distribution",
    repository: policy.repository,
    ref: policy.ref,
    revision: resolvedRevision,
    policy: { path: policyFile.path, sha256: policyFile.sha256 },
    candidates: promotionCandidates,
    productionEligible: true,
  };
}

async function atomicWriteFile(filePath, value) {
  const temporaryPath = resolve(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch((cleanupError) => {
      if (cleanupError.code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }
}

async function ensureDirectoryWithinRoot(projectRoot, directoryPath) {
  const relativeDirectory = projectRelative(projectRoot, directoryPath);
  let currentPath = projectRoot;
  for (const segment of relativeDirectory.split("/")) {
    currentPath = resolve(currentPath, segment);
    let fileInfo;
    try {
      fileInfo = await lstat(currentPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir(currentPath);
      fileInfo = await lstat(currentPath);
    }
    if (fileInfo.isSymbolicLink()) {
      throw new Error(`Promotion output directory cannot traverse a symlink: ${currentPath}`);
    }
    if (!fileInfo.isDirectory()) {
      throw new Error(`Promotion output parent must be a directory: ${currentPath}`);
    }
  }
  const canonicalDirectory = await realpath(directoryPath);
  if (canonicalDirectory !== directoryPath) {
    throw new Error("Promotion output directory cannot traverse a symlink");
  }
}

async function validateOutputTarget(filePath, label) {
  await lstat(filePath)
    .then((fileInfo) => {
      if (fileInfo.isSymbolicLink()) throw new Error(`${label} cannot be a symlink`);
      if (!fileInfo.isFile()) throw new Error(`${label} must be a regular file when it exists`);
    })
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}

function protectedInputPaths(projectRoot, options, receipt) {
  const declaredInputs = [
    options.policyPath,
    ...options.receiptPaths,
    ...options.signingEvidencePaths,
    ...options.deviceAcceptancePaths,
    ...options.receiptPaths.map((path) =>
      resolve(dirname(resolve(projectRoot, path)), "SHA256SUMS"),
    ),
    ...receipt.candidates.flatMap(({ artifacts }) => artifacts.map(({ path }) => path)),
  ];
  return new Set(declaredInputs.map((path) => resolve(projectRoot, path)));
}

export async function writeNativeReleasePromotion({ projectRoot, outputPath, ...options }) {
  const resolvedRoot = await realpath(projectRoot);
  const absoluteOutput = resolve(resolvedRoot, outputPath);
  projectRelative(resolvedRoot, absoluteOutput);
  if (!absoluteOutput.endsWith(".json")) throw new Error("Promotion output must be a JSON file");
  const receipt = await verifyNativeReleasePromotion({ projectRoot: resolvedRoot, ...options });
  const outputDirectory = dirname(absoluteOutput);
  const checksumPath = resolve(outputDirectory, "SHA256SUMS");
  const protectedPaths = protectedInputPaths(resolvedRoot, options, receipt);
  if (protectedPaths.has(absoluteOutput) || protectedPaths.has(checksumPath)) {
    throw new Error("Promotion outputs cannot overwrite release inputs or native artifacts");
  }
  await ensureDirectoryWithinRoot(resolvedRoot, outputDirectory);
  await validateOutputTarget(absoluteOutput, "Promotion output");
  await validateOutputTarget(checksumPath, "Promotion checksum output");

  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  const checksumRecords = [
    ...receipt.candidates.flatMap(({ artifacts }) =>
      artifacts.map(({ path, sha256 }) => ({ path, sha256 })),
    ),
    {
      path: projectRelative(resolvedRoot, absoluteOutput),
      sha256: createHash("sha256").update(content).digest("hex"),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const checksumContent = `${checksumRecords
    .map(({ path, sha256 }) => `${sha256}  ${path}`)
    .join("\n")}\n`;
  await atomicWriteFile(absoluteOutput, content);
  await atomicWriteFile(checksumPath, checksumContent);
  return { receipt, receiptPath: absoluteOutput, checksumPath };
}

function parseArguments(args) {
  const options = {
    policyPath: "config/native-release-promotion.json",
    receiptPaths: [],
    signingEvidencePaths: [],
    deviceAcceptancePaths: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--policy") options.policyPath = value;
    else if (argument === "--receipt") options.receiptPaths.push(value);
    else if (argument === "--signing-evidence") options.signingEvidencePaths.push(value);
    else if (argument === "--device-acceptance") options.deviceAcceptancePaths.push(value);
    else if (argument === "--output") options.outputPath = value;
    else throw new Error(`Unknown argument: ${argument}`);
    if (value === undefined) throw new Error(`Missing value for ${argument}`);
    index += 1;
  }
  if (!options.outputPath) {
    throw new Error(
      "Usage: --receipt <file>... --signing-evidence <file>... --device-acceptance <file>... --output <file>",
    );
  }
  return options;
}

export async function runNativeReleasePromotion(args = process.argv.slice(2), env = process.env) {
  const options = parseArguments(args);
  const { receipt, receiptPath, checksumPath } = await writeNativeReleasePromotion({
    projectRoot: PROJECT_ROOT,
    ...options,
    signingPublicKey: env.EPITON_NATIVE_SIGNING_APPROVAL_PUBLIC_KEY,
    acceptancePublicKey: env.EPITON_NATIVE_DEVICE_ACCEPTANCE_PUBLIC_KEY,
  });
  process.stdout.write(
    `${JSON.stringify({
      schema: receipt.schema,
      scope: receipt.scope,
      revision: receipt.revision,
      productionEligible: receipt.productionEligible,
      receiptPath: projectRelative(PROJECT_ROOT, receiptPath),
      checksumPath: projectRelative(PROJECT_ROOT, checksumPath),
    })}\n`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await runNativeReleasePromotion();
