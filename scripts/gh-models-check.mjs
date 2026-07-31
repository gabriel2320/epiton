#!/usr/bin/env node
/**
 * Discover GNU Health model metadata on a Tryton instance without reading or
 * writing business records. The generated receipt contains technical model
 * names and view capabilities only; it must never contain credentials, URLs,
 * database identifiers, field values, or PHI.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "../packages/protocol/dist/index.js";

const RECEIPT_SCHEMA = "epiton.gnu-health-discovery.v1";
const MAX_MODELS = 500;

function technicalModel(row, field) {
  return typeof row?.[field] === "string" && row[field].startsWith("gnuhealth.")
    ? row[field]
    : null;
}

async function catalogTechnicalNameField(client) {
  const fields = await client.model("ir.model", "fields_get", [[], 0]);
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("ir.model metadata is not an object");
  }

  // Tryton 8 renamed ir.model.model to ir.model.name. Discover the catalog
  // shape instead of coupling GNU Health inspection to a single series.
  if (Object.hasOwn(fields, "model")) return "model";
  if (Object.hasOwn(fields, "name")) return "name";
  throw new Error("ir.model has no supported technical-name field");
}

async function viewCapabilities(client, model) {
  const capabilities = { tree: false, form: false };
  for (const type of Object.keys(capabilities)) {
    try {
      await client.fieldsViewGet(model, null, type);
      capabilities[type] = true;
    } catch {
      // A missing/inaccessible view is represented as false. Error text is
      // intentionally excluded because upstream messages may expose details.
    }
  }
  return capabilities;
}

async function writeReceipt(report) {
  const target = resolve(
    process.env.EPITON_GH_RECEIPT ?? "tests/compat/receipts/gnu-health-latest.json",
  );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const baseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:8080";
  const database = process.env.EPITON_DB ?? "epiton_lab";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "admin";
  const environmentKind = process.env.EPITON_GH_ENVIRONMENT_KIND ?? "unspecified";

  const client = createClient({ baseUrl, database, rpcSuffix: "auto" });
  let loggedIn = false;
  try {
    await client.login(username, password);
    loggedIn = true;

    const technicalNameField = await catalogTechnicalNameField(client);
    const rows = await client.searchRead(
      "ir.model",
      [[technicalNameField, "like", "gnuhealth.%"]],
      [technicalNameField],
      0,
      MAX_MODELS,
      `${technicalNameField} ASC`,
    );
    const names = [
      ...new Set(rows.map((row) => technicalModel(row, technicalNameField)).filter(Boolean)),
    ].sort();
    const models = [];
    for (const model of names) {
      models.push({ model, views: await viewCapabilities(client, model) });
    }

    const report = {
      schema: RECEIPT_SCHEMA,
      target: { environmentKind },
      policy: {
        metadataOnly: true,
        businessRowsRead: false,
        writesPerformed: false,
        containsPhi: false,
      },
      namespace: "gnuhealth.*",
      discovered: models.length,
      truncated: rows.length >= MAX_MODELS,
      models,
    };
    await writeReceipt(report);
    console.log(JSON.stringify(report, null, 2));

    if (models.length === 0) {
      console.error("No GNU Health model metadata found (expected on the stock Tryton lab).");
      process.exitCode = 2;
    }
  } finally {
    if (loggedIn) await client.logout().catch(() => {});
  }
}

main().catch(() => {
  console.error("GNU Health metadata discovery failed; upstream details were redacted.");
  process.exit(1);
});
