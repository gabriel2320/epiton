import { expect, test } from "@playwright/test";
import { installMockTryton, loginThroughBackendMenu } from "./support/mockTryton";

test("dense form layout honors columns, notebook state and responsive paned flow", async ({
  page,
}) => {
  await installMockTryton(page, { denseFormLayout: true });
  await loginThroughBackendMenu(page);
  await page.getByRole("row").filter({ hasText: "Synthetic Alpha" }).click();
  await expect(page.getByRole("heading", { name: "party.party #1" })).toBeVisible();

  const form = page.locator('.epiton-form[data-string="Party"]');
  const formGrid = form.locator(":scope > .epiton-layout-grid");
  const identity = form.locator('.epiton-group[data-string="Identity"]');
  const identityCell = identity.locator("..");
  const nameCell = page.getByLabel("Name").locator("../..");
  const codeCell = page.getByLabel("Code").locator("../..");

  await expect(formGrid).toHaveAttribute("data-layout-columns", "6");
  await expect(identity.locator(":scope > .epiton-layout-grid")).toHaveAttribute(
    "data-layout-columns",
    "6",
  );
  await expect(identityCell).toHaveAttribute("data-colspan", "6");
  await expect(nameCell).toHaveAttribute("data-colspan", "4");
  await expect(nameCell).toHaveAttribute("data-xexpand", "true");
  expect(
    (await formGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(
      " ",
    ),
  ).toHaveLength(6);
  await expect(nameCell).toHaveCSS("grid-column-end", "span 4");
  await expect(codeCell).toHaveCSS("justify-self", "end");

  const detailsToggle = page.getByRole("button", { name: /Details/ });
  await expect(detailsToggle).toHaveAttribute("aria-expanded", "false");
  await detailsToggle.click();
  await expect(detailsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Expandable content stays mounted")).toBeVisible();

  const overviewTab = page.getByRole("tab", { name: "Overview" });
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  const splitTab = page.getByRole("tab", { name: "Split view" });
  await expect(splitTab).toHaveAttribute("aria-selected", "true");
  await expect(splitTab).toBeFocused();

  const paned = page.getByRole("group", { name: "Synthetic split" });
  await expect(paned).toHaveAttribute("data-position", "280");
  await expect(paned.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  const desktopColumns = await paned.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns,
  );
  expect(desktopColumns.split(" ")).toHaveLength(3);
  expect(Number.parseFloat(desktopColumns)).toBeCloseTo(280, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      formGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ")),
    )
    .toHaveLength(1);
  await expect
    .poll(() => paned.evaluate((element) => getComputedStyle(element).gridTemplateRows.split(" ")))
    .toHaveLength(3);
  expect(
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("#root");
      const main = document.querySelector<HTMLElement>(".epiton-main");
      const workspace = document.querySelector<HTMLElement>(".epiton-model-workspace");
      const denseForm = document.querySelector<HTMLElement>('.epiton-form[data-string="Party"]');
      return [root, main, workspace, denseForm].every(
        (element) => element && element.scrollWidth <= element.clientWidth,
      );
    }),
  ).toBe(true);
  await expect(splitTab).toHaveAttribute("aria-selected", "true");

  await splitTab.press("ArrowLeft");
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(detailsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Expandable content stays mounted")).toBeVisible();
  await overviewTab.press("ArrowRight");
  await expect(splitTab).toHaveAttribute("aria-selected", "true");
});
