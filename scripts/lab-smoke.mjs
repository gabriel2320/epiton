import { createClient, resolveWorkspaceModel } from "../packages/protocol/dist/index.js";

async function main() {
  const baseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:8000";
  const database = process.env.EPITON_DB ?? "epiton_lab";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "admin";

  const client = createClient({ baseUrl, database, rpcSuffix: "" });
  const caps = await client.detectCapabilities();
  console.log("capabilities", caps);

  const session = await client.login(username, password);
  console.log("login ok userId=", session.userId);

  try {
    const parties = await client.searchRead("party.party", [], ["name"], 0, 5);
    console.log("party.party rows=", parties.length);
    const created = await client.model(
      "party.party",
      "create",
      [[{ name: `Epiton Smoke ${Date.now()}`, active: true }]],
      {},
    );
    const id = Array.isArray(created) ? Number(created[0]) : Number(created);
    console.log("created party id=", id);
    await client.model("party.party", "write", [[id], { code: "EPITON" }], {});
    console.log("write ok");
  } catch (err) {
    console.log("party module path skipped:", err instanceof Error ? err.message : err);
    const users = await client.searchRead("res.user", [], ["name", "login"], 0, 3);
    console.log("res.user rows=", users.length);
  }

  const companyModel = await resolveWorkspaceModel(client, "company.company");
  if (companyModel) {
    try {
      const view = await client.fieldsViewGet(companyModel, null, "tree");
      console.log("generic workspace model=", companyModel, "tree keys=", Object.keys(view));
      const rows = await client.searchRead(companyModel, [], ["id"], 0, 3);
      console.log("company rows=", rows.length);
    } catch (err) {
      console.log("company path skipped:", err instanceof Error ? err.message : err);
    }
  }

  await client.logout();
  console.log("logout ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
