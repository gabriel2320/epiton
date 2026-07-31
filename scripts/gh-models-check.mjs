#!/usr/bin/env node
/**
 * Probe whether GNU Health models are installed on a Tryton lab.
 * Exit 0 always when reachable; prints JSON status for CI/docs.
 * Never creates clinical records or uses real PHI.
 */
import { createClient } from "../packages/protocol/dist/index.js";

const MODELS = [
  "gnuhealth.patient",
  "gnuhealth.appointment",
  "gnuhealth.prescription.order",
  "gnuhealth.lab",
  "gnuhealth.hospital.bed",
];

async function main() {
  const baseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:8000";
  const database = process.env.EPITON_DB ?? "epiton_lab";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "admin";

  const client = createClient({ baseUrl, database, rpcSuffix: "" });
  await client.login(username, password);

  const results = [];
  for (const model of MODELS) {
    try {
      await client.fieldsViewGet(model, null, "tree");
      const rows = await client.searchRead(model, [], ["id"], 0, 1);
      results.push({ model, installed: true, sampleRows: rows.length });
    } catch (err) {
      results.push({
        model,
        installed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const installed = results.filter((r) => r.installed).length;
  const report = {
    database,
    baseUrl,
    installed,
    total: MODELS.length,
    clinicalPresetReady: installed > 0,
    models: results,
  };
  console.log(JSON.stringify(report, null, 2));
  await client.logout();
  if (installed === 0) {
    console.error("No GNU Health models found. See docs/GNU_HEALTH.md for lab bootstrap.");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
