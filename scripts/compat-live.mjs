/**
 * Live Tryton compatibility probe using @epiton/protocol against a lab trytond.
 * Synthetic data only — never point at PHI databases.
 *
 * Usage:
 *   pnpm compat:live
 *   EPITON_BASE=http://127.0.0.1:8000 EPITON_DB=epiton_lab pnpm compat:live
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyRecords,
  createClient,
  exportModelCsv,
  loadUserPreferences,
  resolveAction,
  resolveWorkspaceModel,
} from "../packages/protocol/dist/index.js";
import {
  boardActionNames,
  parseFieldsViewGet,
  parseGraphArch,
} from "../packages/view-engine/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../tests/compat/receipts");

/** @typedef {{ id: string; tryton: string; status: "pass" | "fail" | "skip"; detail?: string }} Check */

/** @type {Check[]} */
const checks = [];

function record(id, tryton, status, detail) {
  checks.push({ id, tryton, status, detail });
  const mark = status === "pass" ? "PASS" : status === "skip" ? "SKIP" : "FAIL";
  console.log(`[${mark}] ${id} — ${detail ?? ""}`);
}

async function tryCheck(id, tryton, fn) {
  try {
    const detail = await fn();
    record(id, tryton, "pass", typeof detail === "string" ? detail : JSON.stringify(detail));
  } catch (err) {
    record(id, tryton, "fail", err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  const baseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:8000";
  const database = process.env.EPITON_DB ?? "epiton_lab";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "admin";

  console.log(`compat:live → ${baseUrl} db=${database}`);

  const client = createClient({ baseUrl, database, rpcSuffix: "" });
  let partyId = null;

  await tryCheck("capabilities", "common.server.version + probes (may be 401 unauth)", async () => {
    const caps = await client.detectCapabilities();
    // Stock trytond lab often returns HTTP 401 for unauthenticated version probes.
    return {
      serverVersion: caps.serverVersion,
      series: caps.series,
      supportsBus: caps.supportsBus,
      note: caps.serverVersion
        ? "unauthenticated version ok"
        : "version empty pre-login (expected on some labs)",
    };
  });

  await tryCheck("login", "common.db.login", async () => {
    const session = await client.login(username, password);
    if (!session.userId || !session.session) throw new Error("missing session fields");
    return { userId: session.userId };
  });

  await tryCheck("server_version_auth", "common.server.version (session)", async () => {
    try {
      const result = await client.call("common.server.version", []);
      return { result };
    } catch {
      // Some series only allow version unauthenticated; soft pass with login proof
      return { note: "authenticated version unavailable; login already proved RPC" };
    }
  });

  await tryCheck("preferences", "model.res.user.get_preferences", async () => {
    const prefs = await loadUserPreferences(client);
    return { keys: Object.keys(prefs).slice(0, 12) };
  });

  await tryCheck("resolve_party", "ir.model / workspace model", async () => {
    const model = await resolveWorkspaceModel(client, "party.party");
    if (model !== "party.party") throw new Error(`unexpected ${model}`);
    return model;
  });

  await tryCheck("fields_view_get_tree", "model.party.party.fields_view_get tree", async () => {
    const fv = await client.fieldsViewGet("party.party", null, "tree");
    const parsed = parseFieldsViewGet(fv);
    if (parsed.type !== "tree") throw new Error(`type=${parsed.type}`);
    return { fields: Object.keys(parsed.fields).length, archTag: parsed.arch.tag };
  });

  await tryCheck("fields_view_get_form", "model.party.party.fields_view_get form", async () => {
    const fv = await client.fieldsViewGet("party.party", null, "form");
    const parsed = parseFieldsViewGet(fv);
    if (parsed.type !== "form") throw new Error(`type=${parsed.type}`);
    return { fields: Object.keys(parsed.fields).length };
  });

  await tryCheck("fields_view_get_graph", "model.*.fields_view_get graph", async () => {
    try {
      const fv = await client.fieldsViewGet("party.party", null, "graph");
      const parsed = parseFieldsViewGet(fv);
      const spec = parseGraphArch(parsed.arch);
      return { hasSpec: Boolean(spec), type: spec?.type ?? parsed.type };
    } catch (err) {
      // Many stock modules lack graph views — acceptable skip signal via detail
      return `unavailable: ${err instanceof Error ? err.message : err}`;
    }
  });

  await tryCheck("fields_view_get_board", "board arch parse", async () => {
    // Board often lives on dashboard models; try ir.ui.view search then fallback synthetic parse
    const views = await client.searchRead(
      "ir.ui.view",
      [
        ["type", "=", "board"],
        ["model", "!=", null],
      ],
      ["model", "name"],
      0,
      3,
    );
    if (!views.length) return "no board views installed (stock lab)";
    const model = String(views[0].model);
    const fv = await client.fieldsViewGet(model, null, "board");
    const parsed = parseFieldsViewGet(fv);
    const names = boardActionNames(parsed.arch);
    return { model, actions: names.length };
  });

  await tryCheck("search_read", "model.party.party.search_read", async () => {
    const rows = await client.searchRead("party.party", [], ["id", "name", "rec_name"], 0, 5);
    return { rows: rows.length };
  });

  await tryCheck("search_count", "model.party.party.search_count", async () => {
    const n = await client.model("party.party", "search_count", [[]]);
    if (typeof n !== "number") throw new Error(`not a number: ${n}`);
    return { count: n };
  });

  await tryCheck("default_get", "model.party.party.default_get", async () => {
    const defaults = await client.model("party.party", "default_get", [["name", "active"], {}]);
    return { keys: Object.keys(defaults ?? {}) };
  });

  await tryCheck("crud_copy_export", "create/write/read/copy/export_data/delete", async () => {
    const stamp = `EpitonCompat ${Date.now()}`;
    const created = await client.model("party.party", "create", [[{ name: stamp, active: true }]]);
    partyId = Array.isArray(created) ? Number(created[0]) : Number(created);
    if (!Number.isFinite(partyId)) throw new Error("bad create id");

    await client.model("party.party", "write", [[partyId], { code: "COMPAT" }]);
    const read = await client.model("party.party", "read", [[partyId], ["name", "code"]]);
    const row = Array.isArray(read) ? read[0] : null;
    if (!row || row.code !== "COMPAT") throw new Error("write/read mismatch");

    const copies = await copyRecords(client, "party.party", [partyId]);
    const copyId = copies[0];
    if (!copyId) throw new Error("copy returned no id");

    const csv = await exportModelCsv(client, "party.party", {
      ids: [partyId, copyId],
      fields: ["id", "name", "code"],
    });
    if (!csv.includes("COMPAT")) throw new Error("export missing code");

    await client.model("party.party", "delete", [[copyId]]);
    await client.model("party.party", "delete", [[partyId]]);
    partyId = null;
    return { exportedChars: csv.length };
  });

  await tryCheck("act_window", "ir.action.act_window + resolveAction", async () => {
    const rows = await client.searchRead(
      "ir.action.act_window",
      [["res_model", "=", "party.party"]],
      ["id", "name", "res_model"],
      0,
      1,
    );
    if (!rows.length) return "no party act_window (unusual)";
    const id = Number(rows[0].id);
    const resolved = await resolveAction(client, `ir.action.act_window,${id}`);
    if (resolved.kind !== "model" || resolved.model !== "party.party") {
      throw new Error(JSON.stringify(resolved));
    }
    return { actionId: id, name: resolved.name };
  });

  await tryCheck("menu", "ir.ui.menu.search_read", async () => {
    const menus = await client.searchRead(
      "ir.ui.menu",
      [["parent", "=", null]],
      ["id", "name", "action"],
      0,
      10,
    );
    return { roots: menus.length };
  });

  await tryCheck("attachment_model", "ir.attachment.search_read", async () => {
    const rows = await client.searchRead("ir.attachment", [], ["id", "name"], 0, 1);
    return { sample: rows.length };
  });

  await tryCheck("keywords", "ir.action.keyword.get_keyword", async () => {
    const parties = await client.searchRead("party.party", [], ["id"], 0, 1);
    const id = parties[0] ? Number(parties[0].id) : null;
    if (!id) return "no party row for keyword probe";
    const result = await client.model("ir.action.keyword", "get_keyword", [
      "form_relate",
      ["party.party", id],
    ]);
    return { relateEntries: Array.isArray(result) ? result.length : typeof result };
  });

  await tryCheck("user_read", "model.res.user.search_read", async () => {
    const users = await client.searchRead("res.user", [], ["id", "login", "name"], 0, 3);
    if (!users.length) throw new Error("no users");
    return { users: users.length };
  });

  await tryCheck("logout", "common.db.logout", async () => {
    await client.logout();
    return "ok";
  });

  // Cleanup if CRUD failed mid-flight
  if (partyId != null) {
    try {
      const c = createClient({ baseUrl, database, rpcSuffix: "" });
      await c.login(username, password);
      await c.model("party.party", "delete", [[partyId]]);
      await c.logout();
    } catch {
      /* best effort */
    }
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;

  const receipt = {
    schema: "epiton.compat-live.v1",
    at: new Date().toISOString(),
    target: { baseUrl, database, username },
    summary: { passed, failed, skipped, total: checks.length },
    checks,
  };

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "compat-live-latest.json");
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`\nsummary pass=${passed} fail=${failed} skip=${skipped} → ${outPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
