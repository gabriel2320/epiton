import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
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
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const ARTIFACT_POLICIES = {
  "android-debug": {
    formats: ["android-apk"],
    signing: {
      status: "debug-only",
      productionEligible: false,
      requiredPromotionGate: "release signing and real-device acceptance",
    },
  },
  "linux-unsigned": {
    formats: ["debian-package", "appimage"],
    signing: {
      status: "unsigned",
      productionEligible: false,
      requiredPromotionGate: "platform signing and real-device acceptance",
    },
  },
  "android-release-candidate": {
    formats: ["android-apk"],
    signing: {
      status: "external-verification-required",
      productionEligible: false,
      requiredPromotionGate: "signed native release promotion receipt",
    },
  },
  "linux-release-candidate": {
    formats: ["debian-package", "appimage"],
    signing: {
      status: "external-verification-required",
      productionEligible: false,
      requiredPromotionGate: "signed native release promotion receipt",
    },
  },
};

function exactVersion(specifier) {
  return specifier?.replace(/^[~^]/, "") ?? null;
}

function parseMatch(source, pattern, label) {
  const value = source.match(pattern)?.[1];
  if (!value) throw new Error(`Cannot read ${label} from the pinned toolchain sources`);
  return value;
}

function projectRelative(projectRoot, absolutePath) {
  const value = relative(projectRoot, absolutePath);
  if (!value || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new Error(`Path must stay inside the project root: ${absolutePath}`);
  }
  return value.split(sep).join("/");
}

function artifactFormat(filePath) {
  if (filePath.endsWith(".apk")) return "android-apk";
  if (filePath.endsWith(".deb")) return "debian-package";
  if (filePath.endsWith(".AppImage")) return "appimage";
  return null;
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
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

export async function loadToolchain(projectRoot) {
  const paths = {
    packageJson: resolve(projectRoot, "package.json"),
    webPackageJson: resolve(projectRoot, "apps/web/package.json"),
    mobilePackageJson: resolve(projectRoot, "apps/mobile/package.json"),
    desktopPackageJson: resolve(projectRoot, "apps/desktop/package.json"),
    nodeVersion: resolve(projectRoot, ".node-version"),
    rustToolchain: resolve(projectRoot, "rust-toolchain.toml"),
    androidVariables: resolve(projectRoot, "apps/mobile/android/variables.gradle"),
    androidBuild: resolve(projectRoot, "apps/mobile/android/build.gradle"),
    ciWorkflow: resolve(projectRoot, ".github/workflows/ci.yml"),
    gradleWrapper: resolve(
      projectRoot,
      "apps/mobile/android/gradle/wrapper/gradle-wrapper.properties",
    ),
    lockfile: resolve(projectRoot, "pnpm-lock.yaml"),
  };
  const [
    packageSource,
    webPackageSource,
    mobilePackageSource,
    desktopPackageSource,
    nodeVersionSource,
    rustSource,
    androidVariablesSource,
    androidBuildSource,
    ciWorkflowSource,
    gradleWrapperSource,
  ] = await Promise.all([
    readFile(paths.packageJson, "utf8"),
    readFile(paths.webPackageJson, "utf8"),
    readFile(paths.mobilePackageJson, "utf8"),
    readFile(paths.desktopPackageJson, "utf8"),
    readFile(paths.nodeVersion, "utf8"),
    readFile(paths.rustToolchain, "utf8"),
    readFile(paths.androidVariables, "utf8"),
    readFile(paths.androidBuild, "utf8"),
    readFile(paths.ciWorkflow, "utf8"),
    readFile(paths.gradleWrapper, "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const webPackageJson = JSON.parse(webPackageSource);
  const mobilePackageJson = JSON.parse(mobilePackageSource);
  const desktopPackageJson = JSON.parse(desktopPackageSource);

  return {
    node: nodeVersionSource.trim(),
    pnpm: packageJson.packageManager.replace(/^pnpm@/, ""),
    typescript: exactVersion(packageJson.devDependencies.typescript),
    vite: exactVersion(webPackageJson.devDependencies.vite),
    vitest: exactVersion(webPackageJson.devDependencies.vitest),
    capacitor: exactVersion(mobilePackageJson.devDependencies["@capacitor/cli"]),
    tauri: exactVersion(desktopPackageJson.devDependencies["@tauri-apps/cli"]),
    rust: parseMatch(rustSource, /channel\s*=\s*"([^"]+)"/, "Rust channel"),
    android: {
      java: parseMatch(ciWorkflowSource, /java-version:\s*["']?([\d.]+)/, "Java version"),
      minSdk: Number(
        parseMatch(androidVariablesSource, /minSdkVersion\s*=\s*(\d+)/, "Android min SDK"),
      ),
      compileSdk: Number(
        parseMatch(androidVariablesSource, /compileSdkVersion\s*=\s*(\d+)/, "Android compile SDK"),
      ),
      targetSdk: Number(
        parseMatch(androidVariablesSource, /targetSdkVersion\s*=\s*(\d+)/, "Android target SDK"),
      ),
      gradlePlugin: parseMatch(
        androidBuildSource,
        /com\.android\.tools\.build:gradle:([\d.]+)/,
        "Android Gradle Plugin",
      ),
      gradle: parseMatch(gradleWrapperSource, /gradle-([\d.]+)-all\.zip/, "Gradle"),
    },
    lockfileSha256: await sha256File(paths.lockfile),
  };
}

async function resolveRevision(projectRoot, env) {
  if (env.GITHUB_SHA) return env.GITHUB_SHA;
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
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
  return stdout.trim().length > 0;
}

function ciMetadata(env) {
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
  return {
    provider: env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
    repository: env.GITHUB_REPOSITORY ?? null,
    ref: env.GITHUB_REF ?? null,
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    runUrl,
  };
}

async function inspectArtifacts({ projectRoot, artifactPaths, policy }) {
  if (artifactPaths.length === 0) throw new Error("At least one artifact path is required");
  const canonicalPaths = new Set();
  const artifacts = [];

  for (const inputPath of artifactPaths) {
    const absolutePath = resolve(projectRoot, inputPath);
    projectRelative(projectRoot, absolutePath);
    const fileInfo = await lstat(absolutePath);
    if (fileInfo.isSymbolicLink()) throw new Error(`Artifact cannot be a symlink: ${inputPath}`);
    if (!fileInfo.isFile()) throw new Error(`Artifact must be a regular file: ${inputPath}`);

    const canonicalPath = await realpath(absolutePath);
    projectRelative(projectRoot, canonicalPath);
    if (canonicalPath !== absolutePath) {
      throw new Error(`Artifact path cannot traverse a symlink: ${inputPath}`);
    }
    if (canonicalPaths.has(canonicalPath)) throw new Error(`Duplicate artifact: ${inputPath}`);
    canonicalPaths.add(canonicalPath);

    const path = projectRelative(projectRoot, absolutePath);
    const format = artifactFormat(path);
    if (!format || !policy.formats.includes(format)) {
      throw new Error(`Artifact format is not valid for this receipt: ${path}`);
    }
    const { size } = await stat(absolutePath);
    artifacts.push({ path, format, bytes: size, sha256: await sha256File(absolutePath) });
  }

  artifacts.sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
  });
  const observedFormats = new Set(artifacts.map((artifact) => artifact.format));
  for (const format of policy.formats) {
    if (!observedFormats.has(format)) throw new Error(`Missing required ${format} artifact`);
  }
  return artifacts;
}

export async function buildNativeArtifactReceipt({
  projectRoot,
  kind,
  artifactPaths,
  now = () => new Date(),
  revision,
  workingTreeDirty,
  env = process.env,
  toolchain,
}) {
  const resolvedRoot = await realpath(projectRoot);
  const policy = ARTIFACT_POLICIES[kind];
  if (!policy) throw new Error(`Unknown native artifact kind: ${kind}`);
  const artifacts = await inspectArtifacts({
    projectRoot: resolvedRoot,
    artifactPaths,
    policy,
  });

  return {
    schema: "epiton.native-artifacts.v1",
    generatedAt: now().toISOString(),
    kind,
    revision: revision ?? (await resolveRevision(resolvedRoot, env)),
    workingTreeDirty: workingTreeDirty ?? (await resolveWorkingTreeDirty(resolvedRoot)),
    ci: ciMetadata(env),
    signing: policy.signing,
    toolchain: toolchain ?? (await loadToolchain(resolvedRoot)),
    artifacts,
  };
}

export async function writeNativeArtifactReceipt({ projectRoot, outputPath, ...options }) {
  const resolvedRoot = await realpath(projectRoot);
  const absoluteOutput = resolve(resolvedRoot, outputPath);
  projectRelative(resolvedRoot, absoluteOutput);
  if (!absoluteOutput.endsWith(".json")) throw new Error("Receipt output must be a JSON file");

  const receipt = await buildNativeArtifactReceipt({ projectRoot: resolvedRoot, ...options });
  if (
    receipt.artifacts.some((artifact) => resolve(resolvedRoot, artifact.path) === absoluteOutput)
  ) {
    throw new Error("Receipt output cannot also be an input artifact");
  }

  const checksumPath = resolve(dirname(absoluteOutput), "SHA256SUMS");
  const outputDirectory = dirname(absoluteOutput);
  await mkdir(outputDirectory, { recursive: true });
  const canonicalOutputDirectory = await realpath(outputDirectory);
  projectRelative(resolvedRoot, canonicalOutputDirectory);
  if (canonicalOutputDirectory !== outputDirectory) {
    throw new Error(`Receipt directory cannot traverse a symlink: ${outputPath}`);
  }

  const receiptContent = `${JSON.stringify(receipt, null, 2)}\n`;
  const checksumRecords = [
    ...receipt.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 })),
    {
      path: projectRelative(resolvedRoot, absoluteOutput),
      sha256: sha256Text(receiptContent),
    },
  ].sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
  });
  const checksumContent = `${checksumRecords
    .map((record) => `${record.sha256}  ${record.path}`)
    .join("\n")}\n`;
  await atomicWriteFile(absoluteOutput, receiptContent);
  await atomicWriteFile(checksumPath, checksumContent);
  return { receipt, receiptPath: absoluteOutput, checksumPath };
}

function parseArguments(args) {
  let kind;
  let outputPath;
  const artifactPaths = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--kind") {
      kind = args[index + 1];
      index += 1;
    } else if (argument === "--output") {
      outputPath = args[index + 1];
      index += 1;
    } else {
      artifactPaths.push(argument);
    }
  }
  if (!kind || !outputPath) {
    throw new Error(
      "Usage: --kind <android-debug|linux-unsigned|android-release-candidate|linux-release-candidate> --output <file> <artifacts...>",
    );
  }
  return { kind, outputPath, artifactPaths };
}

export async function runNativeArtifactReceipt(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const { receipt, receiptPath, checksumPath } = await writeNativeArtifactReceipt({
    projectRoot: PROJECT_ROOT,
    ...options,
  });
  process.stdout.write(
    `${JSON.stringify({
      schema: receipt.schema,
      kind: receipt.kind,
      artifacts: receipt.artifacts.length,
      workingTreeDirty: receipt.workingTreeDirty,
      productionEligible: receipt.signing.productionEligible,
      receiptPath: projectRelative(PROJECT_ROOT, receiptPath),
      checksumPath: projectRelative(PROJECT_ROOT, checksumPath),
    })}\n`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await runNativeArtifactReceipt();
