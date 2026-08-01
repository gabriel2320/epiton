import { expect, test } from "@playwright/test";
import { installMockTryton } from "./support/mockTryton";

async function login(page: Parameters<typeof installMockTryton>[0]) {
  await page.goto("/");
  await page.getByLabel("Database").fill("epiton_lab");
  await page.getByLabel("User").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Enter Epiton" }).click();
  await expect(page.getByRole("tab", { name: "party.party" })).toBeVisible();
  await expect(page.getByText("Synthetic Alpha").first()).toBeVisible();
}

function waitForRpcResponse(page: Parameters<typeof installMockTryton>[0], method: string) {
  return page.waitForResponse((response) => {
    try {
      const body = response.request().postDataJSON() as { method?: unknown };
      return body.method === method;
    } catch {
      return false;
    }
  });
}

test("browser workflow performs generic Tryton CRUD and keeps JSON-RPC boundaries", async ({
  page,
}) => {
  const mock = await installMockTryton(page);
  await login(page);

  await page.getByRole("button", { name: "New", exact: true }).first().click();
  await page.getByLabel("Name").fill("Synthetic Created");
  await page.getByLabel("Code").fill("SYN-E2E");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /party\.party #\d+/ })).toBeVisible();
  await expect(page.getByText("Synthetic Created").first()).toBeVisible();
  const created = [...mock.records.values()].find((record) => record.code === "SYN-E2E");
  expect(created).toBeDefined();
  expect(mock.calls.some((call) => call.method === "model.party.party.create")).toBe(true);

  await page.getByText("Synthetic Created", { exact: true }).first().click();
  await page.getByRole("button", { name: "Copy", exact: true }).first().click();
  await expect(page.getByRole("status").filter({ hasText: /^Copied/ })).toBeVisible();
  expect(
    [...mock.records.values()].some((record) => record.name === "Synthetic Created copy"),
  ).toBe(true);

  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog).toContainText("Delete 1 party.party record");
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Deleted$/ })).toBeVisible();

  const authorizationCalls = mock.calls.filter((call) => call.method.startsWith("model."));
  expect(authorizationCalls.length).toBeGreaterThan(0);
  expect(mock.calls.some((call) => call.method === "common.db.login")).toBe(true);
  expect(mock.calls.some((call) => call.method === "model.party.party.delete")).toBe(true);
});

test("browser workflow maps CSV import and exports through Tryton methods", async ({ page }) => {
  const mock = await installMockTryton(page);
  await login(page);

  await page.getByLabel("Import CSV file").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,code,active\nSynthetic Imported,SYN-CSV,true\n"),
  });
  const importDialog = page.getByRole("dialog", { name: "Map CSV columns" });
  await expect(importDialog).toBeVisible();
  await importDialog.getByRole("button", { name: /Import \(3 fields\)/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 1 record(s)" })).toBeVisible();
  await expect(page.getByText("Synthetic Imported").first()).toBeVisible();

  const imported = [...mock.records.values()].find((record) => record.code === "SYN-CSV");
  expect(imported).toBeDefined();
  if (!imported) throw new Error("synthetic import was not created");
  await page.getByLabel(`Select ${imported.id}`).check();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export CSV fields" });
  await expect(exportDialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("party.party.csv");

  expect(mock.calls.some((call) => call.method === "model.party.party.import_data")).toBe(true);
  expect(mock.calls.some((call) => call.method === "model.party.party.export_data")).toBe(true);
});

test("browser saves queued one2many create and edit through one parent write without Apply", async ({
  page,
}) => {
  const mock = await installMockTryton(page);
  await login(page);

  await page.getByRole("row").filter({ hasText: "Synthetic Alpha" }).click();
  await expect(page.getByRole("heading", { name: "party.party #1" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Synthetic Alpha");
  await expect(page.getByText("1 record(s)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mode: read", exact: true }).click();
  await page.getByRole("button", { name: "Open lines", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Addresses (one2many)" })).toBeVisible();
  await expect(
    page.getByLabel("Board tree").getByRole("button", { name: /Synthetic Road/ }),
  ).toBeVisible();

  const defaultsResponse = waitForRpcResponse(page, "model.party.address.default_get");
  await page.getByRole("button", { name: "New line", exact: true }).click();
  await defaultsResponse;
  await expect(page.getByRole("heading", { name: "New party.address line" })).toBeVisible();
  await page.getByLabel("Street").fill("Synthetic Avenue");
  await page.getByLabel("City").fill("New City");
  await page.getByRole("button", { name: "Queue create", exact: true }).click();
  await expect(page.getByText(/queued creates: 1 · pending ops: 1/)).toBeVisible();

  await page
    .getByLabel("Board tree")
    .getByRole("button", { name: /Synthetic Road/ })
    .click();
  await expect(page.getByRole("heading", { name: "Edit party.address #10" })).toBeVisible();
  await expect(page.getByLabel("Street")).toHaveValue("Synthetic Road");
  await expect(page.getByLabel("City")).toHaveValue("Old City");
  await page.getByLabel("Street").fill("Synthetic Road Updated");
  await page.getByLabel("City").fill("Updated City");
  await page.getByRole("button", { name: "Queue write", exact: true }).click();
  await expect(page.getByText(/queued creates: 1 · pending ops: 2/)).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  const parentWrites = mock.calls.filter((call) => call.method === "model.party.party.write");
  expect(parentWrites).toHaveLength(1);
  expect(parentWrites[0]?.params[0]).toEqual([1]);
  expect(parentWrites[0]?.params[1]).toMatchObject({
    addresses: [
      ["create", { street: "Synthetic Avenue", city: "New City" }],
      ["write", [10], { street: "Synthetic Road Updated", city: "Updated City" }],
    ],
  });
  expect(parentWrites[0]?.params[2]).toEqual(expect.any(Object));
  expect(mock.records.get(1)?.addresses).toEqual([10, 50]);
  expect(mock.addresses.get(10)).toMatchObject({
    street: "Synthetic Road Updated",
    city: "Updated City",
  });
  expect(mock.calls.some((call) => call.method === "model.party.address.create")).toBe(false);
  expect(mock.calls.some((call) => call.method === "model.party.address.write")).toBe(false);
  expect(mock.addresses.size).toBe(2);
});

test("a late read of A cannot replace or redirect a subsequent write of B", async ({ page }) => {
  const mock = await installMockTryton(page, { holdPartyReadIds: [1] });
  await login(page);

  await page.getByRole("row").filter({ hasText: "Synthetic Alpha" }).click();
  await mock.waitForPartyRead(1);
  let released = false;
  try {
    await page.getByRole("row").filter({ hasText: "Synthetic Beta" }).click();
    await expect(page.getByRole("heading", { name: "party.party #2" })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("Synthetic Beta");

    await page.getByRole("button", { name: "Mode: read", exact: true }).click();
    await page.getByLabel("Name").fill("Synthetic Beta Updated");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

    await mock.releasePartyRead(1);
    released = true;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    await expect(page.getByRole("heading", { name: "party.party #2" })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("Synthetic Beta Updated");
    const writes = mock.calls.filter((call) => call.method === "model.party.party.write");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.params[0]).toEqual([2]);
    expect(mock.records.get(1)?.name).toBe("Synthetic Alpha");
    expect(mock.records.get(2)?.name).toBe("Synthetic Beta Updated");
  } finally {
    if (!released) await mock.releasePartyRead(1);
  }
});
