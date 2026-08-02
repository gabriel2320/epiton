import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = resolve(PROJECT_ROOT, "config/tryton-series-policy.json");
const RELEASE_SIGNALS = ["serverPackage", "serverDocs"];
const LAB_SIGNALS = ["serverPackage", "clientOraclePackage", "serverDocs", "container"];

function errorName(error) {
  return error instanceof Error && error.name ? error.name : "NetworkError";
}

export function classifyTrytonUpstream(sources) {
  const available = (name) => sources[name]?.available === true;
  if (LAB_SIGNALS.every(available)) return "lab-ready";
  if (RELEASE_SIGNALS.every(available)) return "released";
  if (Object.values(sources).some((source) => source.available)) return "emerging";
  if (Object.values(sources).every((source) => !source.reachable)) return "unreachable";
  return "waiting";
}

export function shouldAlertForRelease(state) {
  return state === "released" || state === "lab-ready";
}

async function probeSource(name, url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json,text/html;q=0.9" },
    });
    return {
      name,
      url,
      reachable: true,
      available: response.ok,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      name,
      url,
      reachable: false,
      available: false,
      httpStatus: null,
      error: errorName(error),
    };
  }
}

export async function probeTrytonUpstream({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
  const entries = Object.entries(policy.canary.sources);
  const observations = await Promise.all(
    entries.map(([name, url]) => probeSource(name, url, fetchImpl)),
  );
  const sources = Object.fromEntries(
    observations.map((observation) => [observation.name, observation]),
  );
  const state = classifyTrytonUpstream(sources);

  return {
    schema: "epiton.tryton-upstream-canary.v1",
    observedAt: now().toISOString(),
    series: policy.canary.series,
    state,
    supportClaim: policy.canary.supportClaim,
    sources,
  };
}

export async function runTrytonUpstreamCanary({
  args = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  now,
} = {}) {
  const receipt = await probeTrytonUpstream({ fetchImpl, now });
  const receiptPath = env.EPITON_TRYTON_CANARY_RECEIPT;
  if (receiptPath) {
    const absolutePath = resolve(PROJECT_ROOT, receiptPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

  if (receipt.state === "unreachable") return 1;
  if (args.includes("--fail-on-release") && shouldAlertForRelease(receipt.state)) return 2;
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await runTrytonUpstreamCanary();
}
