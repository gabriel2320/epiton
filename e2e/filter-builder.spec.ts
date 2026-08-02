import { expect, test } from "@playwright/test";
import { installMockTryton, loginThroughBackendMenu } from "./support/mockTryton";

function partySearchCalls(calls: Array<{ method: string; params: unknown[] }>) {
  return calls.filter((call) => call.method === "model.party.party.search_read");
}

test("typed filters apply, persist, reload, and reject malformed domains before RPC", async ({
  page,
}) => {
  const mock = await installMockTryton(page);
  await loginThroughBackendMenu(page);
  await expect(page.getByText("Synthetic Alpha").first()).toBeVisible();

  await page.getByRole("button", { name: "Filter builder" }).click();
  await page.getByLabel("Field for clause 1").selectOption("name");
  await page.getByLabel("Operator for clause 1").selectOption("ilike");
  await page.getByLabel("Value for Name").fill("Synthetic Alpha");
  await page.getByRole("button", { name: "Add clause" }).click();
  await page.getByLabel("Field for clause 2").selectOption("code");
  await page.getByLabel("Value for Code").fill("SYN-001");
  await page.getByLabel("Clause match").selectOption("OR");

  const callsBeforeApply = partySearchCalls(mock.calls).length;
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect.poll(() => partySearchCalls(mock.calls).length).toBeGreaterThan(callsBeforeApply);
  expect(partySearchCalls(mock.calls).at(-1)?.params[0]).toEqual([
    "OR",
    ["name", "ilike", "Synthetic Alpha"],
    ["code", "=", "SYN-001"],
  ]);

  await page.getByRole("button", { name: "Save filter", exact: true }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save filter" });
  await saveDialog.getByLabel("Saved search name").fill("Synthetic OR filter");
  await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved search" })).toBeVisible();
  await expect(page.getByLabel("Saved searches")).toContainText("Synthetic OR filter");
  expect(mock.viewSearches.size).toBe(1);
  expect(mock.calls.some((call) => call.method === "model.ir.ui.view_search.create")).toBe(true);

  await loginThroughBackendMenu(page);
  await expect(page.getByLabel("Saved searches")).toContainText("Synthetic OR filter");
  await page.getByLabel("Saved searches").selectOption({ label: "Synthetic OR filter" });
  await expect(page.getByLabel("Clause match")).toHaveValue("OR");
  await expect(page.getByLabel("Field for clause 1")).toHaveValue("name");
  await expect(page.getByLabel("Value for Name")).toHaveValue("Synthetic Alpha");
  await expect(page.getByLabel("Field for clause 2")).toHaveValue("code");
  await expect(page.getByLabel("Value for Code")).toHaveValue("SYN-001");

  await page.getByRole("button", { name: "Delete filter", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete saved filter" });
  await expect(deleteDialog.getByLabel("Saved search to delete")).toHaveValue("300");
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted saved search" })).toBeVisible();
  await expect(page.getByLabel("Saved searches")).not.toContainText("Synthetic OR filter");
  expect(mock.viewSearches.size).toBe(0);
  expect(mock.calls.some((call) => call.method === "model.ir.ui.view_search.delete")).toBe(true);

  await page.getByRole("button", { name: "Quick / JSON" }).click();
  const searchesBeforeMalformedInput = partySearchCalls(mock.calls).length;
  await page.getByLabel("Domain search").fill('["OR",["name","unsupported","Synthetic Alpha"]]');
  await expect(page.getByRole("alert")).toContainText("unsupported operator");
  await expect(page.getByRole("button", { name: "Filter", exact: true })).toBeDisabled();
  await page.getByLabel("Domain search").press("Enter");
  await page.waitForTimeout(250);
  expect(partySearchCalls(mock.calls)).toHaveLength(searchesBeforeMalformedInput);
});
