import { expect, test } from "@playwright/test";
import { installMockTryton, loginThroughBackendMenu } from "./support/mockTryton";

type JsonObject = Record<string, unknown>;

function hasForeignSelection(context: JsonObject, actionId: number): boolean {
  const actions = context._actions as JsonObject | undefined;
  const source = actions?.["901"] as JsonObject | undefined;
  return (
    context.language === "en" &&
    context.active_id === 1 &&
    JSON.stringify(context.active_ids) === "[1]" &&
    context.active_model === "party.party" &&
    context.action_id === actionId &&
    source?.active_id === 1 &&
    JSON.stringify(source.active_ids) === "[1]" &&
    source.active_model === "party.party"
  );
}

test("board wizard and report use shared Shell hosts with foreign selection context", async ({
  page,
}) => {
  const mock = await installMockTryton(page, { includeWizardReportBoard: true });
  await loginThroughBackendMenu(page);

  await page
    .locator("aside")
    .getByRole("button", { name: "Synthetic Wizard/Report Board", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Board · party.party" })).toBeVisible();

  const sourcePane = page.getByRole("heading", { name: "Source parties" }).locator("..");
  const wizardPane = page.getByRole("heading", { name: "Synthetic Wizard" }).locator("..");
  const reportPane = page.getByRole("heading", { name: "Synthetic Report" }).locator("..");
  await sourcePane.getByRole("button", { name: /Synthetic Alpha/ }).click();

  await wizardPane.getByRole("button", { name: "Open wizard", exact: true }).click();
  const wizardDialog = page.getByRole("dialog", { name: "Wizard" });
  await expect(wizardDialog).toBeVisible();
  await expect(wizardDialog.getByLabel("Wizard technical name")).toHaveValue(
    "synthetic.board_wizard",
  );
  await expect(wizardDialog.locator("p[role='status']")).toContainText(
    "Wizard finished immediately",
  );

  await expect
    .poll(() => {
      const create = mock.calls.find(
        (call) => call.method === "wizard.synthetic.board_wizard.create",
      );
      const execute = mock.calls.find(
        (call) => call.method === "wizard.synthetic.board_wizard.execute",
      );
      const remove = mock.calls.find(
        (call) => call.method === "wizard.synthetic.board_wizard.delete",
      );
      const createContext = create?.params[0] as JsonObject | undefined;
      const executeContext = execute?.params[3] as JsonObject | undefined;
      const deleteContext = remove?.params[1] as JsonObject | undefined;
      return Boolean(
        createContext &&
          executeContext &&
          deleteContext &&
          hasForeignSelection(createContext, 911) &&
          hasForeignSelection(executeContext, 911) &&
          hasForeignSelection(deleteContext, 911),
      );
    })
    .toBe(true);

  await wizardDialog.locator("button.epiton-drawer-close").click();
  await expect(wizardDialog).toBeHidden();

  await reportPane.getByRole("button", { name: "Open report", exact: true }).click();
  const reportDialog = page.getByRole("dialog", { name: "Reports" });
  await expect(reportDialog).toBeVisible();
  await expect(reportDialog.getByLabel("Report name")).toHaveValue("synthetic.board_report");
  await expect(reportDialog.getByLabel("Record ids")).toHaveValue("1");
  await expect(reportDialog.getByLabel("Analytics model")).toHaveValue("party.party");

  await reportDialog.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(() => {
      const report = mock.calls.find(
        (call) => call.method === "report.synthetic.board_report.execute",
      );
      const ids = report?.params[0];
      const data = report?.params[1] as JsonObject | undefined;
      const context = report?.params[2] as JsonObject | undefined;
      return (
        JSON.stringify(ids) === "[1]" &&
        data?.action_id === 912 &&
        data.model === "party.party" &&
        Boolean(context && hasForeignSelection(context, 912))
      );
    })
    .toBe(true);
  await expect(reportDialog.getByRole("status")).toContainText("Preview 35 bytes (html)");
  await expect(reportDialog.getByTitle("Report preview")).toBeVisible();

  await reportDialog
    .getByLabel("Pick registered report")
    .selectOption("synthetic.alternate_report");
  await reportDialog.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(() => {
      const report = mock.calls.find(
        (call) => call.method === "report.synthetic.alternate_report.execute",
      );
      const ids = report?.params[0];
      const data = report?.params[1] as JsonObject | undefined;
      const context = report?.params[2] as JsonObject | undefined;
      return (
        JSON.stringify(ids) === "[1]" &&
        data?.action_id === 913 &&
        data.model === "party.party" &&
        Boolean(context && hasForeignSelection(context, 913))
      );
    })
    .toBe(true);
  await expect(reportDialog.getByRole("status")).toContainText("Preview 35 bytes (html)");
});
