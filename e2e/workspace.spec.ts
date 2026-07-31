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
