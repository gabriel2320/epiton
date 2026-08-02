import { expect, test } from "@playwright/test";

const syntheticCoreLab =
  process.env.EPITON_E2E_GNU_HEALTH === "synthetic-core" &&
  process.env.EPITON_GH_ENVIRONMENT_KIND === "synthetic-gnu-health";

const clinicalWorkspaces = [
  ["Pacientes", "gnuhealth.patient"],
  ["Citas", "gnuhealth.appointment"],
  ["Prescripciones", "gnuhealth.prescription.order"],
] as const;

const syntheticGivenName =
  process.env.EPITON_GH_SYNTHETIC_GIVEN_NAME ?? "Paciente Sintético Epiton";
const syntheticFamilyName = process.env.EPITON_GH_SYNTHETIC_FAMILY_NAME ?? "Laboratorio";
const syntheticClinicalNote =
  process.env.EPITON_GH_SYNTHETIC_CLINICAL_NOTE ??
  "Registro clínico sintético de validación Epiton";
const syntheticAppointmentComment =
  process.env.EPITON_GH_SYNTHETIC_APPOINTMENT_COMMENT ??
  "Cita clínica sintética de validación Epiton";

test("Epiton renders the Spanish GNU Health core through Tryton JSON-RPC", async ({
  page,
}, testInfo) => {
  test.skip(!syntheticCoreLab, "requires the disposable synthetic GNU Health core laboratory");
  test.setTimeout(120_000);

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
    await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();
  }

  await sidebar.getByRole("button", { name: "Reportes", exact: true }).last().click();
  await sidebar
    .getByRole("button", { name: "Evaluaciones del paciente [solo lectura]", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.patient.evaluation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();

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

  const waitForOnChange = async () => {
    const pending = page.getByText("Actualizando campos…", { exact: true });
    await expect(pending).toBeVisible();
    await expect(pending).toBeHidden({ timeout: 30_000 });
  };
  const deleteSelectedRecord = async (model: string) => {
    await page.getByRole("button", { name: "Eliminar", exact: true }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`¿Eliminar 1 registro(s) de ${model}?`);
    await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Eliminado$/ })).toBeVisible();
  };

  const peopleMenu = sidebar.getByRole("button", { name: "Personas", exact: true }).last();
  if (!(await peopleMenu.isVisible())) {
    const partiesMenu = sidebar.getByRole("button", { name: "Terceros", exact: true }).last();
    await partiesMenu.locator("..").getByRole("button", { name: "▸", exact: true }).click();
  }
  await expect(peopleMenu).toBeVisible();
  await peopleMenu.click();
  await expect(page.getByRole("heading", { name: "party.party", exact: true })).toBeVisible();
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();
  const partyDefaultsResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.party.party.default_get";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  const defaultsResponse = await partyDefaultsResponse;
  const defaultsRequest = defaultsResponse.request().postDataJSON() as {
    params?: unknown[];
  };
  const defaultsPayload = (await defaultsResponse.json()) as {
    error?: unknown;
    result?: Record<string, unknown>;
  };
  expect(defaultsRequest.params?.[0]).toContain("fed_country");
  expect(defaultsPayload.error).toBeUndefined();
  expect(defaultsPayload.result?.fed_country).toBe("CHL");
  await expect(page.getByRole("heading", { name: /^party\.party form/ })).toBeVisible();
  await expect(page.locator('input[name="fed_country"]:visible')).toHaveValue("CHL");

  await page.locator('input[name="is_person"]:visible').check();
  await waitForOnChange();
  const patientCheckbox = page.locator('input[name="is_patient"]:visible');
  if (!(await patientCheckbox.isChecked())) {
    await patientCheckbox.check();
    await waitForOnChange();
  }
  await expect(patientCheckbox).toBeChecked();
  await page.locator('select[name="gender"]:visible').selectOption("u");
  await waitForOnChange();
  await page.locator('input[name="name"]:visible').fill(syntheticGivenName);
  await page.locator('input[name="lastname"]:visible').fill(syntheticFamilyName);
  await expect(page.locator('input[name="create_target"]:visible')).toBeChecked();
  const partyCreateResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.party.party.create";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const createResponse = await partyCreateResponse;
  const createRequest = createResponse.request().postDataJSON() as {
    params?: unknown[];
  };
  const createValues = Array.isArray(createRequest.params?.[0])
    ? createRequest.params[0][0]
    : undefined;
  const createPayload = (await createResponse.json()) as {
    error?: unknown;
    result?: unknown;
  };
  expect(createValues).toMatchObject({
    create_target: true,
    fed_country: "CHL",
    gender: "u",
    is_patient: true,
    is_person: true,
    lastname: syntheticFamilyName,
    name: syntheticGivenName,
  });
  expect(createPayload.error).toBeUndefined();
  expect(createPayload.result).toEqual([expect.any(Number)]);
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /party\.party #\d+/ })).toBeVisible();

  const patientListResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.gnuhealth.patient.search_read";
    } catch {
      return false;
    }
  });
  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "gnuhealth.patient", exact: true })).toBeVisible();
  const patientResponse = await patientListResponse;
  const patientRequest = patientResponse.request().postDataJSON() as {
    params?: unknown[];
  };
  const patientPayload = (await patientResponse.json()) as {
    error?: unknown;
    result?: Array<Record<string, unknown>>;
  };
  await testInfo.attach("gnu-health-patient-search-read", {
    body: Buffer.from(
      JSON.stringify({ request: patientRequest, response: patientPayload }, null, 2),
    ),
    contentType: "application/json",
  });
  expect(patientPayload.error).toBeUndefined();
  expect(patientRequest.params?.[4]).toContain("party.rec_name");
  expect(patientPayload.result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(Number),
        "party.": expect.objectContaining({
          rec_name: expect.stringContaining(syntheticGivenName),
        }),
      }),
    ]),
  );
  const patientRecord = patientPayload.result?.find((record) => {
    const party = record["party."];
    return (
      typeof party === "object" &&
      party !== null &&
      String((party as Record<string, unknown>).rec_name ?? "").includes(syntheticGivenName)
    );
  });
  const patientId = Number(patientRecord?.id);
  expect(patientId, "the generated patient must have a Tryton identifier").toBeGreaterThan(0);
  const patientRow = page.getByRole("row").filter({ hasText: syntheticGivenName }).first();
  await expect(patientRow).toBeVisible();
  await patientRow.click();
  await expect(page.getByRole("heading", { name: /gnuhealth\.patient #\d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Modo: lectura", exact: true }).click();
  await page.locator('textarea[name="general_info"]:visible').fill(syntheticClinicalNote);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();

  await sidebar.getByRole("button", { name: "Citas", exact: true }).last().click();
  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  const persistedPatientRow = page.getByRole("row").filter({ hasText: syntheticGivenName }).first();
  await expect(persistedPatientRow).toBeVisible();
  await persistedPatientRow.click();
  await expect(page.locator('textarea[name="general_info"]:visible')).toHaveValue(
    syntheticClinicalNote,
  );

  await sidebar.getByRole("button", { name: "Citas", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.appointment", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /^gnuhealth\.appointment form/ })).toBeVisible();
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("confirmed");
  await expect(page.locator('select[name="urgency"]:visible')).toHaveValue("a");
  await expect(page.locator('select[name="appointment_type"]:visible')).toHaveValue("outpatient");
  await expect(page.locator('select[name="visit_type"]:visible')).toHaveValue("new");
  await expect(page.locator('input[name="appointment_date"]:visible')).not.toHaveValue("");

  const appointmentPatient = page.locator('input[name="patient"]:visible');
  await appointmentPatient
    .locator("..")
    .getByRole("button", { name: "Buscar", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /^Buscar Paciente$/ })).toBeVisible();
  const relationSearch = page.getByRole("textbox", { name: "Buscar relación", exact: true });
  await relationSearch.fill(syntheticGivenName);
  const relationResult = page
    .locator(".epiton-menu-list")
    .getByRole("button")
    .filter({ hasText: syntheticGivenName })
    .first();
  await expect(relationResult).toBeVisible();
  await relationResult.click();
  await waitForOnChange();
  await expect(appointmentPatient).toHaveValue(new RegExp(syntheticGivenName));
  await page.locator('textarea[name="comments"]:visible').fill(syntheticAppointmentComment);

  const appointmentCreateResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.gnuhealth.appointment.create";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const appointmentCreated = await appointmentCreateResponse;
  const appointmentCreateRequest = appointmentCreated.request().postDataJSON() as {
    params?: unknown[];
  };
  const appointmentCreateValues = Array.isArray(appointmentCreateRequest.params?.[0])
    ? appointmentCreateRequest.params[0][0]
    : undefined;
  const appointmentCreatePayload = (await appointmentCreated.json()) as {
    error?: unknown;
    result?: unknown;
  };
  expect(appointmentCreateValues).toMatchObject({
    appointment_type: "outpatient",
    comments: syntheticAppointmentComment,
    patient: patientId,
    state: "confirmed",
    urgency: "a",
    visit_type: "new",
  });
  expect(appointmentCreatePayload.error).toBeUndefined();
  expect(appointmentCreatePayload.result).toEqual([expect.any(Number)]);
  const appointmentId = Number(
    Array.isArray(appointmentCreatePayload.result) ? appointmentCreatePayload.result[0] : undefined,
  );
  expect(appointmentId, "the generated appointment must have a Tryton identifier").toBeGreaterThan(
    0,
  );
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: new RegExp(`gnuhealth\\.appointment #${appointmentId}`) }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Modo: lectura", exact: true }).click();
  await page.locator('select[name="state"]:visible').selectOption("checked_in");
  const appointmentWriteResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.gnuhealth.appointment.write";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const appointmentWritten = await appointmentWriteResponse;
  const appointmentWriteRequest = appointmentWritten.request().postDataJSON() as {
    params?: unknown[];
  };
  const appointmentWritePayload = (await appointmentWritten.json()) as {
    error?: unknown;
    result?: unknown;
  };
  expect(appointmentWriteRequest.params?.[0]).toEqual([appointmentId]);
  expect(appointmentWriteRequest.params?.[1]).toMatchObject({ state: "checked_in" });
  expect(appointmentWritePayload.error).toBeUndefined();
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("checked_in");
  await deleteSelectedRecord("gnuhealth.appointment");

  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  const patientAfterAppointment = page
    .getByRole("row")
    .filter({ hasText: syntheticGivenName })
    .first();
  await expect(patientAfterAppointment).toBeVisible();
  await patientAfterAppointment.click();
  await deleteSelectedRecord("gnuhealth.patient");
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();

  await peopleMenu.click();
  const partyRow = page.getByRole("row").filter({ hasText: syntheticGivenName }).first();
  await expect(partyRow).toBeVisible();
  await partyRow.click();
  await deleteSelectedRecord("party.party");
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();

  const evidence = {
    environmentKind: "synthetic-gnu-health",
    language: "es",
    clinicalModels: [
      ...clinicalWorkspaces.map(([, model]) => model),
      "gnuhealth.patient.evaluation",
    ],
    emptyClinicalLists: true,
    openedUnsavedPatientForm: true,
    patientLifecycle: {
      created: true,
      read: true,
      updated: true,
      deleted: true,
      partyDeleted: true,
      persistedClinicalNote: true,
    },
    appointmentLifecycle: {
      appointmentId,
      created: true,
      defaultState: "confirmed",
      patientLinked: patientId,
      checkedIn: true,
      deleted: true,
    },
    writesPerformed: true,
    syntheticOnly: true,
    cleanupVerifiedInBrowser: true,
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
