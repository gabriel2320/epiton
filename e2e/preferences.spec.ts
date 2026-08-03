import { expect, test } from "@playwright/test";
import { installMockTryton, loginThroughBackendMenu } from "./support/mockTryton";

function rpcContext(params: unknown[]): Record<string, unknown> {
  const value = params.at(-1);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function selectCompany(page: Parameters<typeof installMockTryton>[0], name: string) {
  const preferences = page.getByRole("dialog", { name: "Prefs" });
  await preferences.getByLabel("Company").selectOption({ label: name });
}

test("keeps the active company when Tryton rejects the preference write", async ({ page }) => {
  const mock = await installMockTryton(page, {
    includeCompanyPreferences: true,
    rejectPreferenceWrite: true,
  });
  await loginThroughBackendMenu(page);
  await expect(page.getByText("Synthetic Alpha").first()).toBeVisible();

  await page.getByRole("button", { name: "Prefs", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Prefs" });
  await expect(preferences.getByLabel("Company")).toHaveValue("number:1");
  expect(
    mock.calls.some((call) => call.method === "model.res.user.get_preferences_fields_view"),
  ).toBe(true);
  expect(mock.calls.some((call) => call.method === "model.res.user.fields_view_get")).toBe(false);
  const companySelection = mock.calls.find(
    (call) => call.method === "model.company.company.search_read",
  );
  expect(companySelection?.params[0]).toEqual([["id", "in", [1, 2]]]);
  expect(rpcContext(companySelection?.params ?? [])).toMatchObject({
    active_company: 1,
    company: 1,
  });
  await selectCompany(page, "Hospital Sur");
  await expect(preferences.getByLabel("Company")).toHaveValue("number:2");

  await Promise.all([
    page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.message()).toContain("company, employee, language, or access context");
      await dialog.accept();
    }),
    preferences.getByRole("button", { name: "Save", exact: true }).click(),
  ]);

  await expect(preferences.getByText("Company is not allowed", { exact: true })).toBeVisible();
  const rejectedWrite = mock.calls.find((call) => call.method === "model.res.user.set_preferences");
  expect(rejectedWrite?.params[0]).toEqual({ company: 2 });
  await preferences.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("tab", { name: "party.party" })).toBeVisible();
  expect(
    mock.calls.filter((call) => call.method === "model.res.user.get_preferences"),
  ).toHaveLength(1);
  expect(
    mock.calls.some(
      (call) =>
        call.method === "model.ir.ui.menu.search_read" && rpcContext(call.params).company === 2,
    ),
  ).toBe(false);
});

test("purges the old workspace and reloads menus after an authorized company change", async ({
  page,
}) => {
  const mock = await installMockTryton(page, { includeCompanyPreferences: true });
  await loginThroughBackendMenu(page);
  await expect(page.getByText("Synthetic Alpha").first()).toBeVisible();
  expect(
    mock.calls.some(
      (call) =>
        call.method === "model.ir.ui.menu.search_read" && rpcContext(call.params).company === 1,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Prefs", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Prefs" });
  await selectCompany(page, "Hospital Sur");

  await Promise.all([
    page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.message()).toContain("company, employee, language, or access context");
      await dialog.accept();
    }),
    preferences.getByRole("button", { name: "Save", exact: true }).click(),
  ]);

  await expect(page.getByRole("dialog", { name: "Prefs" })).toBeHidden();
  await expect(page.getByRole("tab", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "party.party" })).toHaveCount(0);
  await expect(
    page.getByText("Choose an action from the backend menu.", { exact: true }),
  ).toBeVisible();
  const acceptedWrite = mock.calls.find((call) => call.method === "model.res.user.set_preferences");
  expect(acceptedWrite?.params[0]).toEqual({ company: 2 });
  await expect
    .poll(
      () =>
        mock.calls.some(
          (call) =>
            call.method === "model.ir.ui.menu.search_read" && rpcContext(call.params).company === 2,
        ),
      { message: "menu RPC should use the authoritative company returned by Tryton" },
    )
    .toBe(true);
  expect(
    mock.calls.filter((call) => call.method === "model.res.user.get_preferences"),
  ).toHaveLength(2);
});
