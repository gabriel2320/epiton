#!/usr/bin/env node
/**
 * Discover GNU Health model metadata on a Tryton instance without reading or
 * writing business records. The generated receipt contains technical model
 * names and view capabilities only; it must never contain credentials, URLs,
 * database identifiers, field values, or PHI.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildSessionContext,
  createClient,
  loadMenus,
  loadUserPreferences,
} from "../packages/protocol/dist/index.js";

const RECEIPT_SCHEMA = "epiton.gnu-health-discovery.v1";
const MAX_MODELS = 500;
const CHILE_CORE_PROFILE = "health-core-cl";
const CHILE_CORE_MODULES = [
  "company",
  "country",
  "currency",
  "health",
  "ir",
  "party",
  "product",
  "res",
];
const CHILE_CORE_VIEWS = [
  {
    model: "gnuhealth.patient",
    type: "tree",
    fields: ["party", "puid", "gender", "age"],
  },
  {
    model: "gnuhealth.patient",
    type: "form",
    fields: ["party", "dob", "current_insurance", "diseases", "medications", "vaccinations"],
  },
  {
    model: "gnuhealth.appointment",
    type: "tree",
    fields: ["patient", "healthprof", "appointment_date", "institution", "state"],
  },
  {
    model: "gnuhealth.patient.evaluation",
    type: "form",
    fields: ["patient", "healthprof", "appointment", "diagnosis", "signed_by", "state"],
  },
  {
    model: "gnuhealth.prescription.order",
    type: "form",
    fields: ["patient", "healthprof", "prescription_line", "state"],
  },
  {
    model: "gnuhealth.vaccination",
    type: "form",
    fields: [
      "patient",
      "vaccine",
      "date",
      "dose",
      "amount",
      "admin_route",
      "admin_site",
      "vaccine_lot",
      "vaccine_expiration_date",
      "healthprof",
      "signed_by",
      "state",
    ],
  },
];

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

async function viewCapabilities(client, model, context) {
  const capabilities = { tree: false, form: false };
  for (const type of Object.keys(capabilities)) {
    try {
      await client.fieldsViewGet(model, null, type, context);
      capabilities[type] = true;
    } catch {
      // A missing/inaccessible view is represented as false. Error text is
      // intentionally excluded because upstream messages may expose details.
    }
  }
  return capabilities;
}

function sortedStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function assertSameStrings(actual, expected, label) {
  const actualSorted = sortedStrings(actual);
  const expectedSorted = sortedStrings(expected);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(`${label} did not match the pinned Chilean core`);
  }
}

function viewFieldNames(view, model, type) {
  if (!view?.fields || typeof view.fields !== "object" || Array.isArray(view.fields)) {
    throw new Error(`${model} ${type} returned malformed field metadata`);
  }
  return Object.keys(view.fields);
}

async function verifyChileCore(client, preferences, context) {
  if (preferences.language !== "es") {
    throw new Error("the authenticated user preference is not Spanish");
  }

  const moduleRows = await client.searchRead(
    "ir.module",
    [["state", "=", "activated"]],
    ["name"],
    0,
    null,
    "name ASC",
    context,
  );
  const activeModules = moduleRows
    .map((row) => row.name)
    .filter((name) => typeof name === "string");
  assertSameStrings(activeModules, CHILE_CORE_MODULES, "activated module set");

  const rootMenus = (await loadMenus(client, context))
    .filter((menu) => menu.parent === null)
    .map((menu) => menu.name);
  for (const translatedName of ["Salud", "Empresas", "Administración"]) {
    if (!rootMenus.includes(translatedName)) {
      throw new Error(`missing Spanish root menu: ${translatedName}`);
    }
  }

  const requiredViews = [];
  for (const specification of CHILE_CORE_VIEWS) {
    const view = await client.fieldsViewGet(specification.model, null, specification.type, context);
    const fields = viewFieldNames(view, specification.model, specification.type);
    const missing = specification.fields.filter((field) => !fields.includes(field));
    if (missing.length > 0) {
      throw new Error(`${specification.model} ${specification.type} is missing required fields`);
    }
    requiredViews.push({
      model: specification.model,
      type: specification.type,
      fieldCount: fields.length,
      requiredFieldsPresent: true,
    });
  }

  return {
    name: CHILE_CORE_PROFILE,
    language: preferences.language,
    activeModules: sortedStrings(activeModules),
    rootMenus: sortedStrings(rootMenus),
    requiredViews,
  };
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
  const profile = process.env.EPITON_GH_PROFILE ?? "discovery";

  if (!["discovery", CHILE_CORE_PROFILE].includes(profile)) {
    throw new Error("unsupported GNU Health verification profile");
  }
  if (profile === CHILE_CORE_PROFILE && environmentKind !== "synthetic-gnu-health") {
    throw new Error("the Chilean core profile requires a synthetic GNU Health environment");
  }

  const client = createClient({ baseUrl, database, rpcSuffix: "auto" });
  let loggedIn = false;
  try {
    await client.login(username, password, profile === CHILE_CORE_PROFILE ? "es" : "en");
    loggedIn = true;

    const preferences = profile === CHILE_CORE_PROFILE ? await loadUserPreferences(client) : {};
    const context = profile === CHILE_CORE_PROFILE ? buildSessionContext(preferences) : {};

    const technicalNameField = await catalogTechnicalNameField(client);
    const rows = await client.searchRead(
      "ir.model",
      [[technicalNameField, "like", "gnuhealth.%"]],
      [technicalNameField],
      0,
      MAX_MODELS,
      `${technicalNameField} ASC`,
      context,
    );
    const names = [
      ...new Set(rows.map((row) => technicalModel(row, technicalNameField)).filter(Boolean)),
    ].sort();
    const models = [];
    for (const model of names) {
      models.push({ model, views: await viewCapabilities(client, model, context) });
    }

    const profileEvidence =
      profile === CHILE_CORE_PROFILE
        ? await verifyChileCore(client, preferences, context)
        : { name: "discovery" };

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
      profile: profileEvidence,
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
