import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTrytonUpstream,
  probeTrytonUpstream,
  shouldAlertForRelease,
} from "./tryton-upstream-canary.mjs";

function sources(available = []) {
  return Object.fromEntries(
    ["serverPackage", "clientOraclePackage", "serverDocs", "container"].map((name) => [
      name,
      {
        reachable: true,
        available: available.includes(name),
        httpStatus: available.includes(name) ? 200 : 404,
      },
    ]),
  );
}

test("classifies waiting, emerging, released, and lab-ready evidence", () => {
  assert.equal(classifyTrytonUpstream(sources()), "waiting");
  assert.equal(classifyTrytonUpstream(sources(["serverPackage"])), "emerging");
  assert.equal(classifyTrytonUpstream(sources(["serverPackage", "serverDocs"])), "released");
  assert.equal(
    classifyTrytonUpstream(
      sources(["serverPackage", "clientOraclePackage", "serverDocs", "container"]),
    ),
    "lab-ready",
  );
});

test("alerts only once official release evidence is coherent", () => {
  assert.equal(shouldAlertForRelease("waiting"), false);
  assert.equal(shouldAlertForRelease("emerging"), false);
  assert.equal(shouldAlertForRelease("released"), true);
  assert.equal(shouldAlertForRelease("lab-ready"), true);
});

test("probes every official source without treating 404 as a network failure", async () => {
  const receipt = await probeTrytonUpstream({
    fetchImpl: async (url) =>
      new Response(null, { status: String(url).includes("trytond") ? 200 : 404 }),
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });

  assert.equal(receipt.series, "9.0");
  assert.equal(receipt.state, "emerging");
  assert.equal(receipt.supportClaim, false);
  assert.equal(Object.keys(receipt.sources).length, 4);
  assert.equal(receipt.sources.serverDocs.reachable, true);
  assert.equal(receipt.sources.serverDocs.available, false);
});
