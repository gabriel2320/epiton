import { expect, test } from "@playwright/test";

const disposableLab = process.env.EPITON_E2E_LAB === "disposable";

test("live disposable lab crosses browser, protocol, gateway and trytond", async ({ page }) => {
  test.skip(!disposableLab, "requires EPITON_E2E_LAB=disposable");

  const database = process.env.EPITON_DB ?? "epiton_lab";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "admin";
  const marker = `EPITON-E2E-${Date.now()}`;

  await page.goto("/");
  await page.getByLabel("Database").fill(database);
  await page.getByLabel("User").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter Epiton" }).click();
  await expect(page.getByRole("tab", { name: "party.party" })).toBeVisible();

  await page.getByRole("button", { name: "New", exact: true }).first().click();
  await page.getByLabel("Name").fill(marker);
  const code = page.getByLabel("Code");
  if (await code.isEditable()) await code.fill(marker);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /party\.party #\d+/ })).toBeVisible();
  await expect(page.getByText(marker).first()).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Deleted$/ })).toBeVisible();
  await expect(page.getByText(marker)).toHaveCount(0);
});
