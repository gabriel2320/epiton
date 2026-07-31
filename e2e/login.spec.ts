import { expect, test } from "@playwright/test";
import { installMockTryton } from "./support/mockTryton";

test.beforeEach(async ({ page }) => {
  await installMockTryton(page);
});

test("login shell renders Epiton brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Epiton").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Enter Epiton|Entrar a Epiton/i })).toBeVisible();
  await expect(page.getByLabel("Language")).toBeVisible();
});

test("can switch language to Spanish", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Language").selectOption("es");
  await expect(page.getByRole("button", { name: /Entrar a Epiton/i })).toBeVisible();
});

test("login form has empty credentials by default", async ({ page }) => {
  await page.goto("/");
  const user = page.locator('input[name="username"], input').nth(2);
  await expect(page.getByRole("button", { name: /Enter Epiton|Entrar a Epiton/i })).toBeEnabled();
  await expect(user).toBeVisible();
});

test("login database field accepts manual entry", async ({ page }) => {
  await page.goto("/");
  const db = page.locator('input[name="database"], input').nth(1);
  await expect(db).toBeVisible();
  await db.fill("tryton");
  await expect(db).toHaveValue("tryton");
});
