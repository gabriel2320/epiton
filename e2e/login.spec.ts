import { expect, test } from "@playwright/test";

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
