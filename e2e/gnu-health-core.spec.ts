import { expect, test } from "@playwright/test";

const syntheticCoreLab =
  process.env.EPITON_E2E_GNU_HEALTH === "synthetic-core" &&
  process.env.EPITON_GH_ENVIRONMENT_KIND === "synthetic-gnu-health";

const clinicalWorkspaces = [
  ["Pacientes", "gnuhealth.patient"],
  ["Citas", "gnuhealth.appointment"],
  ["Prescripciones", "gnuhealth.prescription.order"],
] as const;

test("Epiton renders the Spanish GNU Health core through Tryton JSON-RPC", async ({
  page,
}, testInfo) => {
  test.skip(!syntheticCoreLab, "requires the disposable synthetic GNU Health core laboratory");

  const baseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:58001";
  const database = process.env.EPITON_DB ?? "epiton_health_core";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "epiton-health-synthetic-admin";
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
    );
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Language").selectOption("es");
  await page.getByLabel("Servidor", { exact: true }).fill(baseUrl);
  await page.getByLabel("Base de datos", { exact: true }).fill(database);
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar a Epiton", exact: true }).click();

  const sidebar = page.getByRole("complementary", { name: "Menú", exact: true });
  await expect(sidebar).toBeVisible({ timeout: 30_000 });

  for (const [menu, model] of clinicalWorkspaces) {
    await sidebar.getByRole("button", { name: menu, exact: true }).last().click();
    await expect(page.getByRole("heading", { name: model, exact: true })).toBeVisible();
    await expect(page.getByText("No records", { exact: true }).first()).toBeVisible();
  }

  await sidebar.getByRole("button", { name: "Reportes", exact: true }).last().click();
  await sidebar
    .getByRole("button", { name: "Evaluaciones del paciente [solo lectura]", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.patient.evaluation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No records", { exact: true }).first()).toBeVisible();

  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "gnuhealth.patient", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /^gnuhealth\.patient form/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paciente", exact: true }).first()).toBeVisible();

  const formLayout = await page.locator(".epiton-view-form").evaluate((form) => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const controls = Array.from(
      form.querySelectorAll(
        ".epiton-field > input, .epiton-field > textarea, .epiton-field > select, .epiton-field-label, .epiton-label, .epiton-m2o > *, .epiton-reference > *",
      ),
    ).filter(visible);
    const roundedRect = (rect: DOMRect) => ({
      bottom: Math.round(rect.bottom * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
    });
    const overlaps: Array<{
      first: string;
      firstRect: ReturnType<typeof roundedRect>;
      gridColumns: string;
      overlapHeight: number;
      overlapWidth: number;
      parent: string;
      second: string;
      secondRect: ReturnType<typeof roundedRect>;
    }> = [];

    for (let firstIndex = 0; firstIndex < controls.length; firstIndex += 1) {
      const first = controls[firstIndex];
      if (!first) continue;
      const firstRect = first.getBoundingClientRect();
      for (let secondIndex = firstIndex + 1; secondIndex < controls.length; secondIndex += 1) {
        const second = controls[secondIndex];
        if (!second || first.contains(second) || second.contains(first)) continue;
        const secondRect = second.getBoundingClientRect();
        const overlapWidth =
          Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
        const overlapHeight =
          Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          overlaps.push({
            first: `${first.tagName.toLowerCase()}:${first.getAttribute("name") ?? first.textContent?.trim() ?? ""}`,
            firstRect: roundedRect(firstRect),
            gridColumns: getComputedStyle(first.parentElement ?? first).gridTemplateColumns,
            overlapHeight: Math.round(overlapHeight * 100) / 100,
            overlapWidth: Math.round(overlapWidth * 100) / 100,
            parent: first.parentElement?.className ?? "",
            second: `${second.tagName.toLowerCase()}:${second.getAttribute("name") ?? second.textContent?.trim() ?? ""}`,
            secondRect: roundedRect(secondRect),
          });
        }
      }
    }

    const rect = form.getBoundingClientRect();
    const relationInputWidths = Array.from(
      form.querySelectorAll(".epiton-m2o > input, .epiton-reference > input"),
    )
      .filter(visible)
      .map((input) => Math.round(input.getBoundingClientRect().width));
    const skinnyLabels = Array.from(
      form.querySelectorAll('.epiton-layout-cell[data-layout-role="label"] .epiton-label'),
    )
      .filter(visible)
      .map((label) => ({
        label: label.textContent?.trim() ?? "",
        rect: roundedRect(label.getBoundingClientRect()),
      }))
      .filter(({ rect: labelRect }) => labelRect.width < 80 && labelRect.height > 32);
    return {
      width: Math.round(rect.width),
      overlaps,
      explicitLabels: form.querySelectorAll(".epiton-label[data-field-name]").length,
      responsiveLabels: form.querySelectorAll('.epiton-layout-cell[data-layout-role="label"]')
        .length,
      responsiveControls: form.querySelectorAll('.epiton-layout-cell[data-layout-role="control"]')
        .length,
      duplicateLabels: form.querySelectorAll(
        '.epiton-field[data-has-explicit-label="true"] > .epiton-field-label',
      ).length,
      relationInputWidths,
      skinnyLabels,
    };
  });
  expect(
    formLayout.width,
    "clinical form must have enough horizontal space",
  ).toBeGreaterThanOrEqual(700);
  expect(
    formLayout.explicitLabels,
    "Tryton XML labels must be associated with fields",
  ).toBeGreaterThan(0);
  expect(formLayout.duplicateLabels, "explicit Tryton labels must not be duplicated").toBe(0);
  expect(formLayout.responsiveLabels, "visible Tryton label cells need responsive roles").toBe(
    formLayout.explicitLabels,
  );
  expect(formLayout.responsiveControls, "visible Tryton fields need responsive roles").toBe(
    formLayout.explicitLabels,
  );
  expect(
    formLayout.relationInputWidths.length,
    "clinical form must expose relation inputs",
  ).toBeGreaterThan(0);
  expect(
    Math.min(...formLayout.relationInputWidths),
    "relation inputs must remain usable in dense Tryton forms",
  ).toBeGreaterThanOrEqual(120);
  expect(formLayout.skinnyLabels, "clinical labels must not collapse into vertical text").toEqual(
    [],
  );

  const screenshotPath = testInfo.outputPath("gnu-health-core.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("gnu-health-core", { path: screenshotPath, contentType: "image/png" });
  expect(formLayout.overlaps, "visible labels and controls must not overlap").toEqual([]);

  const overlaySelector = "vite-error-overlay, #webpack-dev-server-client-overlay, nextjs-portal";
  await expect(page.locator(overlaySelector)).toHaveCount(0);
  expect((await page.locator("body").innerText()).trim().length).toBeGreaterThan(100);

  const cdp = await page.context().newCDPSession(page);
  const accessibility = await cdp.send("Accessibility.getFullAXTree");
  const accessibleNodes = accessibility.nodes
    .filter((node) => !node.ignored)
    .map((node) => ({
      name: String(node.name?.value ?? ""),
      role: String(node.role?.value ?? ""),
    }));
  expect(
    accessibleNodes.some(
      (node) => node.role === "heading" && node.name.startsWith("gnuhealth.patient form"),
    ),
  ).toBe(true);
  expect(accessibleNodes.some((node) => node.role === "button" && node.name === "Guardar")).toBe(
    true,
  );

  await testInfo.attach("gnu-health-core-accessibility", {
    body: Buffer.from(JSON.stringify(accessibleNodes, null, 2)),
    contentType: "application/json",
  });
  const evidence = {
    environmentKind: "synthetic-gnu-health",
    language: "es",
    clinicalModels: [
      ...clinicalWorkspaces.map(([, model]) => model),
      "gnuhealth.patient.evaluation",
    ],
    emptyClinicalLists: true,
    openedUnsavedPatientForm: true,
    writesPerformed: false,
    containsPhi: false,
    accessibilityNodeCount: accessibleNodes.length,
    formLayout,
    consoleErrors,
    pageErrors,
    failedResponses,
    failedRequests,
  };
  await testInfo.attach("gnu-health-core-evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });

  expect(
    consoleErrors,
    `browser console errors\nfailed responses:\n${failedResponses.join("\n")}\nfailed requests:\n${failedRequests.join("\n")}`,
  ).toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(failedResponses, "HTTP responses with status >= 400").toEqual([]);
  expect(failedRequests, "browser requests that failed before a response").toEqual([]);
});
