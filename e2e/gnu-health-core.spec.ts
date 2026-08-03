import { type Locator, type Page, type Response, type Route, expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const syntheticCoreLab =
  process.env.EPITON_E2E_GNU_HEALTH === "synthetic-core" &&
  process.env.EPITON_GH_ENVIRONMENT_KIND === "synthetic-gnu-health";

const clinicalWorkspaces = [
  ["Pacientes", "gnuhealth.patient"],
  ["Citas", "gnuhealth.appointment"],
  ["Prescripciones", "gnuhealth.prescription.order"],
] as const;

type RoleAccess = {
  read: 0 | 1;
  write: 0 | 1;
  create: 0 | 1;
  delete: 0 | 1;
};

type RoleWorkspace = {
  access: RoleAccess;
  menu: string;
  model: string;
  parent?: string;
};

type RoleProfile = {
  expandBeforeHidden?: string[];
  key: string;
  login: string;
  visibleMenus: string[];
  hiddenMenus: string[];
  workspaces: RoleWorkspace[];
};

const fullAccess: RoleAccess = { read: 1, write: 1, create: 1, delete: 1 };
const clinicalAccess: RoleAccess = { read: 1, write: 1, create: 1, delete: 0 };
const readOnlyAccess: RoleAccess = { read: 1, write: 0, create: 0, delete: 0 };

const patientWorkspace = (access: RoleAccess): RoleWorkspace => ({
  access,
  menu: "Pacientes",
  model: "gnuhealth.patient",
});

const appointmentWorkspace = (access: RoleAccess): RoleWorkspace => ({
  access,
  menu: "Citas",
  model: "gnuhealth.appointment",
});

const roleProfiles: RoleProfile[] = [
  {
    key: "admin",
    login: process.env.EPITON_USER ?? "admin",
    visibleMenus: ["Pacientes", "Citas", "Prescripciones", "Reportes", "Enfermería"],
    hiddenMenus: [],
    workspaces: [
      patientWorkspace(fullAccess),
      appointmentWorkspace(fullAccess),
      {
        access: fullAccess,
        menu: "Prescripciones",
        model: "gnuhealth.prescription.order",
      },
      {
        access: clinicalAccess,
        menu: "Evaluaciones del paciente [solo lectura]",
        model: "gnuhealth.patient.evaluation",
        parent: "Reportes",
      },
    ],
  },
  {
    key: "nursing-admin",
    login: "epiton_health_role_nursing_admin",
    visibleMenus: [],
    hiddenMenus: [
      "Pacientes",
      "Citas",
      "Prescripciones",
      "Reportes",
      "Enfermería",
      "Vacunación del Paciente",
    ],
    workspaces: [],
  },
  {
    key: "nurse",
    login: "epiton_health_role_nurse",
    visibleMenus: ["Pacientes", "Enfermería"],
    hiddenMenus: ["Citas", "Prescripciones", "Reportes"],
    workspaces: [
      patientWorkspace(readOnlyAccess),
      {
        access: clinicalAccess,
        menu: "Vacunación del Paciente",
        model: "gnuhealth.vaccination",
        parent: "Enfermería",
      },
    ],
  },
  {
    key: "frontdesk",
    login: "epiton_health_role_frontdesk",
    visibleMenus: ["Pacientes", "Citas"],
    hiddenMenus: ["Prescripciones", "Reportes", "Enfermería"],
    workspaces: [patientWorkspace(clinicalAccess), appointmentWorkspace(fullAccess)],
  },
  {
    key: "doctor",
    login: "epiton_health_role_doctor",
    visibleMenus: ["Pacientes", "Citas", "Prescripciones", "Reportes"],
    hiddenMenus: ["Enfermería"],
    workspaces: [
      patientWorkspace(clinicalAccess),
      appointmentWorkspace(fullAccess),
      {
        access: clinicalAccess,
        menu: "Prescripciones",
        model: "gnuhealth.prescription.order",
      },
      {
        access: clinicalAccess,
        menu: "Evaluaciones del paciente [solo lectura]",
        model: "gnuhealth.patient.evaluation",
        parent: "Reportes",
      },
    ],
  },
  {
    key: "social-worker",
    login: "epiton_health_role_social_worker",
    visibleMenus: ["Pacientes"],
    hiddenMenus: ["Citas", "Prescripciones", "Reportes", "Enfermería"],
    workspaces: [patientWorkspace(clinicalAccess)],
  },
  {
    key: "back-office",
    login: "epiton_health_role_back_office",
    visibleMenus: ["Pacientes", "Citas"],
    hiddenMenus: ["Prescripciones", "Reportes", "Enfermería"],
    workspaces: [patientWorkspace(clinicalAccess), appointmentWorkspace(fullAccess)],
  },
  {
    key: "no-role",
    login: "epiton_health_role_no_role",
    visibleMenus: [],
    hiddenMenus: ["Pacientes", "Citas", "Prescripciones", "Reportes", "Enfermería"],
    workspaces: [],
  },
];

function isModelAccessResponse(page: Page, model: string) {
  return page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as {
        method?: unknown;
        params?: unknown[];
      };
      return (
        request.method === "model.ir.model.access.get_access" &&
        Array.isArray(request.params?.[0]) &&
        request.params[0][0] === model
      );
    } catch {
      return false;
    }
  });
}

const syntheticGivenName =
  process.env.EPITON_GH_SYNTHETIC_GIVEN_NAME ?? "Paciente Sintético Epiton";
const syntheticFamilyName = process.env.EPITON_GH_SYNTHETIC_FAMILY_NAME ?? "Laboratorio";
const syntheticClinicalNote =
  process.env.EPITON_GH_SYNTHETIC_CLINICAL_NOTE ??
  "Registro clínico sintético de validación Epiton";
const syntheticConcurrentClinicalNote = `${syntheticClinicalNote} · edición vigente`;
const syntheticStaleClinicalNote = `${syntheticClinicalNote} · edición obsoleta`;
const syntheticAppointmentComment =
  process.env.EPITON_GH_SYNTHETIC_APPOINTMENT_COMMENT ??
  "Cita clínica sintética de validación Epiton";
const syntheticEvaluationComplaint =
  process.env.EPITON_GH_SYNTHETIC_EVALUATION_COMPLAINT ??
  "Motivo clínico sintético de validación Epiton";
const syntheticEvaluationComplaintUpdated = `${syntheticEvaluationComplaint} actualizado`;
const syntheticPrescriptionNote =
  process.env.EPITON_GH_SYNTHETIC_PRESCRIPTION_NOTE ??
  "Prescripción sintética de validación Epiton";
const syntheticMedicamentName =
  process.env.EPITON_GH_SYNTHETIC_MEDICAMENT_NAME ?? "Paracetamol sintético Epiton 500 mg";
const syntheticVaccinationObservation =
  process.env.EPITON_GH_SYNTHETIC_VACCINATION_OBSERVATION ??
  "Vacunación sintética de validación Epiton";
const syntheticVaccineName =
  process.env.EPITON_GH_SYNTHETIC_VACCINE_NAME ?? "Vacuna influenza sintética Epiton";
const syntheticVaccineLot = process.env.EPITON_GH_SYNTHETIC_VACCINE_LOT ?? "EPITON-LOTE-VAC-001";
const syntheticVaccineExpirationDate =
  process.env.EPITON_GH_SYNTHETIC_VACCINE_EXPIRATION_DATE ?? "2030-12-31";
const primaryInstitutionName =
  process.env.EPITON_GH_PRIMARY_INSTITUTION_NAME ?? "Hospital Norte Sintético Epiton";
const secondaryInstitutionName =
  process.env.EPITON_GH_SECONDARY_INSTITUTION_NAME ?? "Hospital Sur Sintético Epiton";

function isRpcResponse(response: Response, method: string) {
  try {
    const request = response.request().postDataJSON() as { method?: unknown };
    return request.method === method;
  } catch {
    return false;
  }
}

function rpcContext(params: unknown[] | undefined): Record<string, unknown> {
  const context = params?.at(-1);
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  return context as Record<string, unknown>;
}

async function selectPreferenceCompany(page: Page, companyName: string) {
  const preferences = page.getByRole("dialog", { name: "Preferencias", exact: true });
  const company = preferences.locator('select[name="company"]:visible');
  await expect(company).toBeVisible();
  await company.selectOption({ label: companyName });
  const encodedId = await company.inputValue();
  expect(encodedId).toMatch(/^number:\d+$/);
  const id = Number(encodedId.slice("number:".length));
  expect(id, `company id for ${companyName}`).toBeGreaterThan(0);
  await expect(company).toHaveValue(`number:${id}`);
  return id;
}

async function savePreferenceCompany(page: Page, expectedCompanyId: number) {
  const preferences = page.getByRole("dialog", { name: "Preferencias", exact: true });
  const responsePromise = page.waitForResponse((response) =>
    isRpcResponse(response, "model.res.user.set_preferences"),
  );
  const confirmationPromise = page.waitForEvent("dialog").then(async (confirmation) => {
    const details = {
      message: confirmation.message(),
      type: confirmation.type(),
    };
    await confirmation.accept();
    return details;
  });
  const [, confirmation] = await Promise.all([
    preferences.getByRole("button", { name: "Guardar", exact: true }).click(),
    confirmationPromise,
  ]);
  expect(confirmation.type).toBe("confirm");
  expect(confirmation.message).toContain("cerrará el trabajo abierto");

  const response = await responsePromise;
  const request = response.request().postDataJSON() as {
    params?: Array<Record<string, unknown>>;
  };
  const payload = (await response.json()) as { error?: unknown };
  expect(request.params?.[0]).toMatchObject({ company: expectedCompanyId });
  expect(payload.error).toBeUndefined();
  await expect(preferences).toBeHidden();
}

async function expectAppointmentInstitution(
  page: Page,
  sidebar: Locator,
  expectedCompanyId: number,
  expectedInstitutionName: string,
) {
  await sidebar.getByRole("button", { name: "Citas", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.appointment", exact: true }),
  ).toBeVisible();
  const defaultsPromise = page.waitForResponse((response) =>
    isRpcResponse(response, "model.gnuhealth.appointment.default_get"),
  );
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  const defaults = await defaultsPromise;
  const request = defaults.request().postDataJSON() as { params?: unknown[] };
  const payload = (await defaults.json()) as { error?: unknown };
  expect(rpcContext(request.params)).toMatchObject({ company: expectedCompanyId });
  expect(payload.error).toBeUndefined();
  await expect(page.locator('input[name="institution"]:visible')).toHaveValue(
    expectedInstitutionName,
  );
}

test("Epiton respeta la empresa activa y los defaults institucionales de GNU Health", async ({
  page,
}) => {
  test.skip(!syntheticCoreLab, "requires the disposable synthetic GNU Health core laboratory");
  test.setTimeout(180_000);

  const baseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:58001";
  const database = process.env.EPITON_DB ?? "epiton_health_core";
  const username = process.env.EPITON_USER ?? "admin";
  const password = process.env.EPITON_PASSWORD ?? "epiton-health-synthetic-admin";

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Language").selectOption("es");
  await page.getByLabel("Servidor", { exact: true }).fill(baseUrl);
  await page.getByLabel("Base de datos", { exact: true }).fill(database);
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar a Epiton", exact: true }).click();

  const sidebar = page.getByRole("complementary", { name: "Menú", exact: true });
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  await sidebar.getByRole("button", { name: "Citas", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.appointment", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Preferencias", exact: true }).click();
  const secondaryCompanyId = await selectPreferenceCompany(page, secondaryInstitutionName);
  await savePreferenceCompany(page, secondaryCompanyId);
  await expect(
    page.getByRole("heading", { name: "gnuhealth.appointment", exact: true }),
  ).toHaveCount(0);
  await expectAppointmentInstitution(page, sidebar, secondaryCompanyId, secondaryInstitutionName);

  await page.getByRole("button", { name: "Preferencias", exact: true }).click();
  const primaryCompanyId = await selectPreferenceCompany(page, primaryInstitutionName);
  expect(primaryCompanyId).not.toBe(secondaryCompanyId);
  await savePreferenceCompany(page, primaryCompanyId);
  await expect(page.getByRole("heading", { name: /^gnuhealth\.appointment form/ })).toHaveCount(0);
  await expectAppointmentInstitution(page, sidebar, primaryCompanyId, primaryInstitutionName);
});

test("Epiton renders the Spanish GNU Health core through Tryton JSON-RPC", async ({
  page,
}, testInfo) => {
  test.skip(!syntheticCoreLab, "requires the disposable synthetic GNU Health core laboratory");
  test.setTimeout(240_000);

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
  const evaluationAccessResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as {
        method?: unknown;
        params?: unknown[];
      };
      return (
        request.method === "model.ir.model.access.get_access" &&
        Array.isArray(request.params?.[0]) &&
        request.params[0][0] === "gnuhealth.patient.evaluation"
      );
    } catch {
      return false;
    }
  });
  await sidebar
    .getByRole("button", { name: "Evaluaciones del paciente [solo lectura]", exact: true })
    .last()
    .click();
  const evaluationAccess = await evaluationAccessResponse;
  const evaluationAccessRequest = evaluationAccess.request().postDataJSON() as {
    params?: unknown[];
  };
  const evaluationAccessPayload = (await evaluationAccess.json()) as {
    error?: unknown;
    result?: Record<string, Record<string, unknown>>;
  };
  expect(evaluationAccessRequest.params?.[0]).toEqual(["gnuhealth.patient.evaluation"]);
  expect(evaluationAccessPayload.error).toBeUndefined();
  expect(evaluationAccessPayload.result?.["gnuhealth.patient.evaluation"]).toMatchObject({
    read: 1,
    write: 1,
    create: 1,
    delete: 0,
  });
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

  const waitForModelResponse = (method: string) =>
    page.waitForResponse((response) => {
      try {
        const request = response.request().postDataJSON() as { method?: unknown };
        return request.method === method;
      } catch {
        return false;
      }
    });
  const deleteSelectedRecord = async (model: string) => {
    await page.getByRole("button", { name: "Eliminar", exact: true }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`¿Eliminar 1 registro(s) de ${model}?`);
    const deleteResponse = waitForModelResponse(`model.${model}.delete`);
    await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
    const deleted = await deleteResponse;
    const deleteRequest = deleted.request().postDataJSON() as { params?: unknown[] };
    const deletePayload = (await deleted.json()) as { error?: unknown; result?: unknown };
    expect(deleteRequest.params?.[0]).toEqual([expect.any(Number)]);
    expect(deletePayload.error).toBeUndefined();
    expect(deletePayload.result).toBeNull();
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
  const patientCheckbox = page.locator('input[name="is_patient"]:visible');
  if (!(await patientCheckbox.isChecked())) {
    await patientCheckbox.check();
  }
  await expect(patientCheckbox).toBeChecked();
  await page.locator('select[name="gender"]:visible').selectOption("u");
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
  expect(patientRequest.params?.[4]).toContain("_timestamp");
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
  const patientTimestamp = String(patientRecord?._timestamp ?? "");
  expect(patientTimestamp, "the patient list must carry Tryton's concurrency timestamp").not.toBe(
    "",
  );
  const patientRow = page.getByRole("row").filter({ hasText: syntheticGivenName }).first();
  await expect(patientRow).toBeVisible();
  await patientRow.click();
  await expect(page.getByRole("heading", { name: /gnuhealth\.patient #\d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Modo: lectura", exact: true }).click();
  await page.locator('textarea[name="general_info"]:visible').fill(syntheticClinicalNote);
  const refreshedPatientRecord = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as {
        method?: unknown;
        params?: unknown[];
      };
      return (
        request.method === "model.gnuhealth.patient.read" &&
        Array.isArray(request.params?.[0]) &&
        request.params[0][0] === patientId
      );
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  const refreshedPatientPayload = (await (await refreshedPatientRecord).json()) as {
    error?: unknown;
    result?: Array<Record<string, unknown>>;
  };
  expect(refreshedPatientPayload.error).toBeUndefined();
  const stalePatientTimestamp = String(refreshedPatientPayload.result?.[0]?._timestamp ?? "");
  expect(stalePatientTimestamp).not.toBe("");
  expect(stalePatientTimestamp).not.toBe(patientTimestamp);

  await sidebar.getByRole("button", { name: "Citas", exact: true }).last().click();
  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "gnuhealth.patient", exact: true })).toBeVisible();
  const persistedPatientRow = page.getByRole("row").filter({ hasText: syntheticGivenName }).first();
  await expect(persistedPatientRow).toBeVisible();
  await persistedPatientRow.click();
  await expect(page.locator('textarea[name="general_info"]:visible')).toHaveValue(
    syntheticClinicalNote,
  );

  const concurrentPage = await page.context().newPage();
  try {
    await concurrentPage.goto("/", { waitUntil: "networkidle" });
    await concurrentPage.getByLabel("Language").selectOption("es");
    await concurrentPage.getByLabel("Servidor", { exact: true }).fill(baseUrl);
    await concurrentPage.getByLabel("Base de datos", { exact: true }).fill(database);
    await concurrentPage.getByLabel("Usuario", { exact: true }).fill(username);
    await concurrentPage.getByLabel("Contraseña", { exact: true }).fill(password);
    await concurrentPage.getByRole("button", { name: "Entrar a Epiton", exact: true }).click();

    const concurrentSidebar = concurrentPage.getByRole("complementary", {
      name: "Menú",
      exact: true,
    });
    await expect(concurrentSidebar).toBeVisible({ timeout: 30_000 });
    await concurrentSidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
    await expect(
      concurrentPage.getByRole("heading", { name: "gnuhealth.patient", exact: true }),
    ).toBeVisible();
    const concurrentPatientRow = concurrentPage
      .getByRole("row")
      .filter({ hasText: syntheticGivenName })
      .first();
    await expect(concurrentPatientRow).toBeVisible();
    const concurrentRecordReadResponse = concurrentPage.waitForResponse((response) => {
      try {
        const request = response.request().postDataJSON() as {
          method?: unknown;
          params?: unknown[];
        };
        return (
          request.method === "model.gnuhealth.patient.read" &&
          Array.isArray(request.params?.[0]) &&
          request.params[0][0] === patientId
        );
      } catch {
        return false;
      }
    });
    await concurrentPatientRow.click();
    await expect(
      concurrentPage.getByRole("heading", {
        name: new RegExp(`gnuhealth\\.patient #${patientId}`),
      }),
    ).toBeVisible();
    await expect(concurrentPage.locator('textarea[name="general_info"]:visible')).toHaveValue(
      syntheticClinicalNote,
    );
    const concurrentRecordReadPayload = (await (await concurrentRecordReadResponse).json()) as {
      error?: unknown;
      result?: Array<Record<string, unknown>>;
    };
    expect(concurrentRecordReadPayload.error).toBeUndefined();
    const concurrentPatientTimestamp = String(
      concurrentRecordReadPayload.result?.[0]?._timestamp ?? "",
    );
    expect(concurrentPatientTimestamp).toBe(stalePatientTimestamp);

    await concurrentPage.getByRole("button", { name: "Modo: lectura", exact: true }).click();
    await concurrentPage
      .locator('textarea[name="general_info"]:visible')
      .fill(syntheticConcurrentClinicalNote);
    const concurrentWriteResponse = concurrentPage.waitForResponse((response) => {
      try {
        const request = response.request().postDataJSON() as { method?: unknown };
        return request.method === "model.gnuhealth.patient.write";
      } catch {
        return false;
      }
    });
    const refreshedConcurrentRecord = concurrentPage.waitForResponse((response) => {
      try {
        const request = response.request().postDataJSON() as {
          method?: unknown;
          params?: unknown[];
        };
        return (
          request.method === "model.gnuhealth.patient.read" &&
          Array.isArray(request.params?.[0]) &&
          request.params[0][0] === patientId
        );
      } catch {
        return false;
      }
    });
    await concurrentPage.getByRole("button", { name: "Guardar", exact: true }).click();
    const concurrentWrite = await concurrentWriteResponse;
    const concurrentWriteRequest = concurrentWrite.request().postDataJSON() as {
      params?: unknown[];
    };
    const concurrentWritePayload = (await concurrentWrite.json()) as { error?: unknown };
    const concurrentWriteContext = concurrentWriteRequest.params?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(concurrentWriteRequest.params?.[0]).toEqual([patientId]);
    expect(concurrentWriteRequest.params?.[1]).toMatchObject({
      general_info: syntheticConcurrentClinicalNote,
    });
    expect(concurrentWriteContext?._timestamp).toMatchObject({
      [`gnuhealth.patient,${patientId}`]: concurrentPatientTimestamp,
    });
    expect(concurrentWritePayload.error).toBeUndefined();
    await expect(
      concurrentPage.getByRole("status").filter({ hasText: /^Guardado$/ }),
    ).toBeVisible();

    const refreshedConcurrentResponse = await refreshedConcurrentRecord;
    const refreshedConcurrentPayload = (await refreshedConcurrentResponse.json()) as {
      error?: unknown;
      result?: Array<Record<string, unknown>>;
    };
    expect(refreshedConcurrentPayload.error).toBeUndefined();
    const currentPatientTimestamp = String(
      refreshedConcurrentPayload.result?.[0]?._timestamp ?? "",
    );
    expect(currentPatientTimestamp).not.toBe("");
    expect(currentPatientTimestamp).not.toBe(concurrentPatientTimestamp);

    await page.getByRole("button", { name: "Modo: lectura", exact: true }).click();
    await page.locator('textarea[name="general_info"]:visible').fill(syntheticStaleClinicalNote);
    const staleWriteResponse = page.waitForResponse((response) => {
      try {
        const request = response.request().postDataJSON() as { method?: unknown };
        return request.method === "model.gnuhealth.patient.write";
      } catch {
        return false;
      }
    });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    const staleWrite = await staleWriteResponse;
    const staleWriteRequest = staleWrite.request().postDataJSON() as { params?: unknown[] };
    const staleWritePayload = (await staleWrite.json()) as {
      error?: { message?: unknown } | unknown[];
    };
    const staleWriteContext = staleWriteRequest.params?.[2] as Record<string, unknown> | undefined;
    expect(staleWriteRequest.params?.[0]).toEqual([patientId]);
    expect(staleWriteRequest.params?.[1]).toMatchObject({
      general_info: syntheticStaleClinicalNote,
    });
    expect(staleWriteContext?._timestamp).toMatchObject({
      [`gnuhealth.patient,${patientId}`]: stalePatientTimestamp,
    });
    expect(staleWritePayload.error).toBeDefined();
    await expect(page.getByRole("alert").last()).toBeVisible();
    await expect(concurrentPage.locator('textarea[name="general_info"]:visible')).toHaveValue(
      syntheticConcurrentClinicalNote,
    );

    await concurrentPage.getByRole("button", { name: "Modo: lectura", exact: true }).click();
    await concurrentPage
      .locator('textarea[name="general_info"]:visible')
      .fill(syntheticClinicalNote);
    const restoredWriteResponse = concurrentPage.waitForResponse((response) => {
      try {
        const request = response.request().postDataJSON() as { method?: unknown };
        return request.method === "model.gnuhealth.patient.write";
      } catch {
        return false;
      }
    });
    await concurrentPage.getByRole("button", { name: "Guardar", exact: true }).click();
    const restoredWrite = await restoredWriteResponse;
    const restoredWriteRequest = restoredWrite.request().postDataJSON() as { params?: unknown[] };
    const restoredWritePayload = (await restoredWrite.json()) as { error?: unknown };
    const restoredWriteContext = restoredWriteRequest.params?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(restoredWriteContext?._timestamp).toMatchObject({
      [`gnuhealth.patient,${patientId}`]: currentPatientTimestamp,
    });
    expect(restoredWritePayload.error).toBeUndefined();
  } finally {
    await concurrentPage.close();
  }

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Modo: edición", exact: true }).click();

  const evaluationsAction = page.getByRole("button", {
    name: "Evaluaciones",
    exact: true,
  });
  await expect(evaluationsAction).toBeVisible();
  await evaluationsAction.click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.patient.evaluation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();

  const evaluationDefaultsResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.gnuhealth.patient.evaluation.default_get";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  const evaluationDefaults = await evaluationDefaultsResponse;
  const evaluationDefaultsRequest = evaluationDefaults.request().postDataJSON() as {
    params?: unknown[];
  };
  const evaluationDefaultsPayload = (await evaluationDefaults.json()) as {
    error?: unknown;
    result?: Record<string, unknown>;
  };
  const evaluationContext = evaluationDefaultsRequest.params?.at(-1);
  expect(evaluationContext).toMatchObject({
    active_id: patientId,
    active_ids: [patientId],
    active_model: "gnuhealth.patient",
  });
  expect(evaluationDefaultsPayload.error).toBeUndefined();
  expect(evaluationDefaultsPayload.result).toMatchObject({
    evaluation_type: "outpatient",
    healthprof: expect.any(Number),
    state: "in_progress",
  });
  await expect(
    page.getByRole("heading", { name: /^gnuhealth\.patient\.evaluation form/ }),
  ).toBeVisible();
  await expect(page.locator('input[name="patient"]:visible')).toHaveValue(
    new RegExp(syntheticGivenName),
  );
  await expect(page.locator('input[name="healthprof"]:visible')).toHaveValue(
    /Profesional Sintético Epiton/,
  );
  await expect(page.locator('select[name="evaluation_type"]:visible')).toHaveValue("outpatient");
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("in_progress");
  await expect(page.locator('input[name="evaluation_start"]:visible')).not.toHaveValue("");
  await page.locator('input[name="chief_complaint"]:visible').fill(syntheticEvaluationComplaint);

  const evaluationCreateResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.gnuhealth.patient.evaluation.create";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const evaluationCreated = await evaluationCreateResponse;
  const evaluationCreateRequest = evaluationCreated.request().postDataJSON() as {
    params?: unknown[];
  };
  const evaluationCreateValues = Array.isArray(evaluationCreateRequest.params?.[0])
    ? evaluationCreateRequest.params[0][0]
    : undefined;
  const evaluationCreatePayload = (await evaluationCreated.json()) as {
    error?: unknown;
    result?: unknown;
  };
  expect(evaluationCreateValues).toMatchObject({
    chief_complaint: syntheticEvaluationComplaint,
    evaluation_type: "outpatient",
    patient: patientId,
  });
  expect(evaluationCreatePayload.error).toBeUndefined();
  expect(evaluationCreatePayload.result).toEqual([expect.any(Number)]);
  const evaluationId = Number(
    Array.isArray(evaluationCreatePayload.result) ? evaluationCreatePayload.result[0] : undefined,
  );
  expect(evaluationId, "the generated evaluation must have a Tryton identifier").toBeGreaterThan(0);
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`gnuhealth\\.patient\\.evaluation #${evaluationId}`),
    }),
  ).toBeVisible();
  await expect(page.locator('input[name="healthprof"]:visible')).toHaveValue(
    /Profesional Sintético Epiton/,
  );
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("in_progress");

  await page.getByRole("button", { name: "Modo: lectura", exact: true }).click();
  await page
    .locator('input[name="chief_complaint"]:visible')
    .fill(syntheticEvaluationComplaintUpdated);
  const evaluationWriteResponse = page.waitForResponse((response) => {
    try {
      const request = response.request().postDataJSON() as { method?: unknown };
      return request.method === "model.gnuhealth.patient.evaluation.write";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const evaluationWritten = await evaluationWriteResponse;
  const evaluationWriteRequest = evaluationWritten.request().postDataJSON() as {
    params?: unknown[];
  };
  const evaluationWritePayload = (await evaluationWritten.json()) as {
    error?: unknown;
  };
  expect(evaluationWriteRequest.params?.[0]).toEqual([evaluationId]);
  expect(evaluationWriteRequest.params?.[1]).toMatchObject({
    chief_complaint: syntheticEvaluationComplaintUpdated,
  });
  expect(evaluationWritePayload.error).toBeUndefined();
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(page.locator('input[name="chief_complaint"]:visible')).toHaveValue(
    syntheticEvaluationComplaintUpdated,
  );
  const evaluationDeleteButtons = page.getByRole("button", {
    name: "Eliminar",
    exact: true,
  });
  await expect(evaluationDeleteButtons).toHaveCount(2);
  await expect(evaluationDeleteButtons.first()).toBeDisabled();
  await expect(evaluationDeleteButtons.last()).toBeDisabled();

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
  const appointmentPatientOnChange = waitForModelResponse(
    "model.gnuhealth.appointment.on_change_patient",
  );
  await relationResult.click();
  const appointmentPatientOnChangeResponse = await appointmentPatientOnChange;
  const appointmentPatientOnChangePayload = (await appointmentPatientOnChangeResponse.json()) as {
    error?: unknown;
  };
  expect(appointmentPatientOnChangePayload.error).toBeUndefined();
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
  await expect(page.getByRole("heading", { name: "gnuhealth.patient", exact: true })).toBeVisible();
  const patientAfterAppointment = page
    .getByRole("row")
    .filter({ hasText: syntheticGivenName })
    .first();
  await expect(patientAfterAppointment).toBeVisible();
  await patientAfterAppointment.click();
  await expect(page.locator('textarea[name="general_info"]:visible')).toHaveValue(
    syntheticClinicalNote,
  );

  const prescriptionsAction = page.getByRole("button", {
    name: "Recetas",
    exact: true,
  });
  await expect(prescriptionsAction).toBeVisible();
  await prescriptionsAction.click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.prescription.order", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();

  const prescriptionDefaultsResponse = waitForModelResponse(
    "model.gnuhealth.prescription.order.default_get",
  );
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  const prescriptionDefaults = await prescriptionDefaultsResponse;
  const prescriptionDefaultsRequest = prescriptionDefaults.request().postDataJSON() as {
    params?: unknown[];
  };
  const prescriptionDefaultsPayload = (await prescriptionDefaults.json()) as {
    error?: unknown;
    result?: Record<string, unknown>;
  };
  expect(prescriptionDefaultsRequest.params?.at(-1)).toMatchObject({
    active_id: patientId,
    active_ids: [patientId],
    active_model: "gnuhealth.patient",
  });
  expect(prescriptionDefaultsPayload.error).toBeUndefined();
  expect(prescriptionDefaultsPayload.result).toMatchObject({
    healthprof: expect.any(Number),
    state: "draft",
  });
  await expect(
    page.getByRole("heading", { name: /^gnuhealth\.prescription\.order form/ }),
  ).toBeVisible();
  await expect(page.locator('input[name="patient"]:visible')).toHaveValue(
    new RegExp(syntheticGivenName),
  );
  await expect(page.locator('input[name="healthprof"]:visible')).toHaveValue(
    /Profesional Sintético Epiton/,
  );
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("draft");
  await expect(page.locator('input[name="prescription_date"]:visible')).not.toHaveValue("");
  await page.locator('textarea[name="notes"]:visible').fill(syntheticPrescriptionNote);
  await page.locator('input[name="prescription_warning_ack"]:visible').check();

  const prescriptionLines = page.locator('.epiton-field[data-field-name="prescription_line"]');
  await prescriptionLines.getByRole("button", { name: "Abrir líneas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Items de la receta (one2many)", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nueva línea", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Nueva línea de gnuhealth.prescription.line",
      exact: true,
    }),
  ).toBeVisible();

  const medicamentInput = page.locator('input[name="medicament"]:visible');
  await medicamentInput.locator("..").getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Buscar Medicamento", exact: true }),
  ).toBeVisible();
  const prescriptionRelationSearch = page.getByRole("textbox", {
    name: "Buscar relación",
    exact: true,
  });
  await prescriptionRelationSearch.fill(syntheticMedicamentName);
  const medicamentResult = page
    .locator(".epiton-menu-list")
    .getByRole("button")
    .filter({ hasText: syntheticMedicamentName })
    .first();
  await expect(medicamentResult).toBeVisible();
  const medicamentOnChangeResponse = waitForModelResponse(
    "model.gnuhealth.prescription.line.on_change_medicament",
  );
  await medicamentResult.click();
  const medicamentOnChange = await medicamentOnChangeResponse;
  const medicamentOnChangePayload = (await medicamentOnChange.json()) as { error?: unknown };
  expect(medicamentOnChangePayload.error).toBeUndefined();
  await expect(medicamentInput).toHaveValue(new RegExp(syntheticMedicamentName));
  await page.getByRole("button", { name: "Encolar creación", exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: /^Creación en cola — Guarde el registro principal para escribir$/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aplicar cambios de relación", exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: /^Cambios de relación en cola — Guarde el registro principal para escribir$/,
    }),
  ).toBeVisible();

  const prescriptionCreateResponse = waitForModelResponse(
    "model.gnuhealth.prescription.order.create",
  );
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const prescriptionCreated = await prescriptionCreateResponse;
  const prescriptionCreateRequest = prescriptionCreated.request().postDataJSON() as {
    params?: unknown[];
  };
  const prescriptionCreateValues = Array.isArray(prescriptionCreateRequest.params?.[0])
    ? prescriptionCreateRequest.params[0][0]
    : undefined;
  const prescriptionCreatePayload = (await prescriptionCreated.json()) as {
    error?: unknown;
    result?: unknown;
  };
  expect(prescriptionCreateValues).toMatchObject({
    notes: syntheticPrescriptionNote,
    patient: patientId,
    prescription_warning_ack: true,
    prescription_line: [
      [
        "create",
        [
          expect.objectContaining({
            medicament: expect.any(Number),
            qty: 1,
            quantity: 1,
          }),
        ],
      ],
    ],
  });
  expect(prescriptionCreatePayload.error).toBeUndefined();
  expect(prescriptionCreatePayload.result).toEqual([expect.any(Number)]);
  const prescriptionId = Number(
    Array.isArray(prescriptionCreatePayload.result)
      ? prescriptionCreatePayload.result[0]
      : undefined,
  );
  expect(
    prescriptionId,
    "the generated prescription must have a Tryton identifier",
  ).toBeGreaterThan(0);
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`gnuhealth\\.prescription\\.order #${prescriptionId}`),
    }),
  ).toBeVisible();
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("draft");

  const prescriptionFinalizeMethod = "model.gnuhealth.prescription.order.create_prescription";
  let prescriptionFinalizeRequestCount = 0;
  let releasePrescriptionFinalize = () => {};
  const prescriptionFinalizeGate = new Promise<void>((resolve) => {
    releasePrescriptionFinalize = resolve;
  });
  const holdPrescriptionFinalize = async (route: Route) => {
    let method: unknown;
    try {
      method = (route.request().postDataJSON() as { method?: unknown }).method;
    } catch {
      await route.continue();
      return;
    }
    if (method !== prescriptionFinalizeMethod) {
      await route.continue();
      return;
    }
    prescriptionFinalizeRequestCount += 1;
    await prescriptionFinalizeGate;
    await route.continue();
  };
  await page.route("**/*", holdPrescriptionFinalize);
  const finalizePrescriptionResponse = waitForModelResponse(prescriptionFinalizeMethod);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Crear prescripción?");
    await dialog.accept();
  });
  const createPrescriptionButton = page.getByRole("button", { name: "Crear", exact: true });
  await createPrescriptionButton.click();
  await expect.poll(() => prescriptionFinalizeRequestCount).toBe(1);
  await expect(createPrescriptionButton).toBeDisabled();
  await expect(createPrescriptionButton).toHaveAttribute("aria-busy", "true");
  await createPrescriptionButton.evaluate((button) => (button as HTMLButtonElement).click());
  expect(prescriptionFinalizeRequestCount).toBe(1);
  releasePrescriptionFinalize();
  const prescriptionFinalized = await finalizePrescriptionResponse;
  await page.unroute("**/*", holdPrescriptionFinalize);
  const prescriptionFinalizationRequest = prescriptionFinalized.request().postDataJSON() as {
    params?: unknown[];
  };
  const prescriptionFinalizationPayload = (await prescriptionFinalized.json()) as {
    error?: unknown;
  };
  expect(prescriptionFinalizationRequest.params?.[0]).toEqual([prescriptionId]);
  expect(prescriptionFinalizationPayload.error).toBeUndefined();
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("done");
  await expect(page.locator('textarea[name="notes"]:visible')).toBeDisabled();
  await expect(page.locator('input[name="prescription_warning_ack"]:visible')).toBeDisabled();
  await expect(page.getByRole("button", { name: "Crear", exact: true })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "gnuhealth.patient", exact: true })).toBeVisible();
  const patientAfterPrescription = page
    .getByRole("row")
    .filter({ hasText: syntheticGivenName })
    .first();
  await expect(patientAfterPrescription).toBeVisible();
  await patientAfterPrescription.click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`gnuhealth\\.patient #${patientId}`),
    }),
  ).toBeVisible();
  await expect(page.locator('textarea[name="general_info"]:visible')).toHaveValue(
    syntheticClinicalNote,
  );

  const relatedActions = page
    .getByRole("heading", { name: "Relacionadas", exact: true })
    .locator("..");
  const vaccinationsAction = relatedActions.getByRole("button", {
    name: "Vacunaciones",
    exact: true,
  });
  await expect(vaccinationsAction).toBeVisible();
  await vaccinationsAction.click();
  await expect(
    page.getByRole("heading", { name: "gnuhealth.vaccination", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sin registros", { exact: true }).first()).toBeVisible();

  const vaccinationDefaultsResponse = waitForModelResponse(
    "model.gnuhealth.vaccination.default_get",
  );
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  const vaccinationDefaults = await vaccinationDefaultsResponse;
  const vaccinationDefaultsRequest = vaccinationDefaults.request().postDataJSON() as {
    params?: unknown[];
  };
  const vaccinationDefaultsPayload = (await vaccinationDefaults.json()) as {
    error?: unknown;
    result?: Record<string, unknown>;
  };
  expect(vaccinationDefaultsRequest.params?.at(-1)).toMatchObject({
    active_id: patientId,
    active_ids: [patientId],
    active_model: "gnuhealth.patient",
  });
  expect(vaccinationDefaultsPayload.error).toBeUndefined();
  expect(vaccinationDefaultsPayload.result).toMatchObject({
    dose: 1,
    healthprof: expect.any(Number),
    state: "in_progress",
  });
  await expect(page.getByRole("heading", { name: /^gnuhealth\.vaccination form/ })).toBeVisible();
  await expect(page.locator('input[name="patient"]:visible')).toHaveValue(
    new RegExp(syntheticGivenName),
  );
  await expect(page.locator('input[name="healthprof"]:visible')).toHaveValue(
    /Profesional Sintético Epiton/,
  );
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("in_progress");
  await expect(page.locator('input[name="dose"]:visible')).toHaveValue("1");
  await expect(page.locator('input[name="date"]:visible')).not.toHaveValue("");

  const vaccineInput = page.locator('input[name="vaccine"]:visible');
  await vaccineInput.locator("..").getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Buscar Vacuna", exact: true })).toBeVisible();
  const vaccineRelationSearch = page.getByRole("textbox", {
    name: "Buscar relación",
    exact: true,
  });
  await vaccineRelationSearch.fill(syntheticVaccineName);
  const vaccineResult = page
    .locator(".epiton-menu-list")
    .getByRole("button")
    .filter({ hasText: syntheticVaccineName })
    .first();
  await expect(vaccineResult).toBeVisible();
  await vaccineResult.click();
  await expect(vaccineInput).toHaveValue(new RegExp(syntheticVaccineName));

  await page.locator('input[name="amount"]:visible').fill("0.5");
  await page.locator('select[name="admin_route"]:visible').selectOption("im");
  await page.locator('select[name="admin_site"]:visible').selectOption("ld");
  await page.locator('input[name="vaccine_lot"]:visible').fill(syntheticVaccineLot);
  await page
    .locator('input[name="vaccine_expiration_date"]:visible')
    .fill(syntheticVaccineExpirationDate);
  await page.locator('textarea[name="observations"]:visible').fill(syntheticVaccinationObservation);

  const vaccinationCreateResponse = waitForModelResponse("model.gnuhealth.vaccination.create");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const vaccinationCreated = await vaccinationCreateResponse;
  const vaccinationCreateRequest = vaccinationCreated.request().postDataJSON() as {
    params?: unknown[];
  };
  const vaccinationCreateValues = Array.isArray(vaccinationCreateRequest.params?.[0])
    ? vaccinationCreateRequest.params[0][0]
    : undefined;
  const vaccinationCreatePayload = (await vaccinationCreated.json()) as {
    error?: unknown;
    result?: unknown;
  };
  expect(vaccinationCreateValues).toMatchObject({
    admin_route: "im",
    admin_site: "ld",
    amount: 0.5,
    observations: syntheticVaccinationObservation,
    patient: patientId,
    vaccine: expect.any(Number),
    vaccine_expiration_date: {
      __class__: "date",
      year: 2030,
      month: 12,
      day: 31,
    },
    vaccine_lot: syntheticVaccineLot,
  });
  expect(vaccinationCreatePayload.error).toBeUndefined();
  expect(vaccinationCreatePayload.result).toEqual([expect.any(Number)]);
  const vaccinationId = Number(
    Array.isArray(vaccinationCreatePayload.result) ? vaccinationCreatePayload.result[0] : undefined,
  );
  expect(vaccinationId, "the generated vaccination must have a Tryton identifier").toBeGreaterThan(
    0,
  );
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: new RegExp(`gnuhealth\\.vaccination #${vaccinationId}`) }),
  ).toBeVisible();
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("in_progress");

  const finalizeVaccinationResponse = waitForModelResponse("model.gnuhealth.vaccination.sign");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      "¿Finalizar y firmar esta vacunación? ¡Esta vacunación será de solo lectura!",
    );
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Firmar", exact: true }).click();
  const vaccinationFinalized = await finalizeVaccinationResponse;
  const vaccinationFinalizationRequest = vaccinationFinalized.request().postDataJSON() as {
    params?: unknown[];
  };
  const vaccinationFinalizationPayload = (await vaccinationFinalized.json()) as {
    error?: unknown;
  };
  expect(vaccinationFinalizationRequest.params?.[0]).toEqual([vaccinationId]);
  expect(vaccinationFinalizationPayload.error).toBeUndefined();
  await expect(page.locator('select[name="state"]:visible')).toHaveValue("done");
  await expect(page.locator('input[name="signed_by"]:visible')).toHaveValue(
    /Profesional Sintético Epiton/,
  );
  await expect(page.locator('input[name="vaccine_lot"]:visible')).toBeDisabled();
  await expect(page.locator('textarea[name="observations"]:visible')).toBeDisabled();
  await expect(page.getByRole("button", { name: "Firmar", exact: true })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Pacientes", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "gnuhealth.patient", exact: true })).toBeVisible();
  const patientForReport = page.getByRole("row").filter({ hasText: syntheticGivenName }).first();
  await expect(patientForReport).toBeVisible();
  await patientForReport.click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`gnuhealth\\.patient #${patientId}`),
    }),
  ).toBeVisible();

  const printActions = page.getByRole("heading", { name: "Imprimir", exact: true }).locator("..");
  const patientCardAction = printActions.getByRole("button", {
    name: "Carnet de Identidad",
    exact: true,
  });
  await expect(patientCardAction).toBeVisible();
  await patientCardAction.click();

  const reportDialog = page.getByRole("dialog", { name: "Informes", exact: true });
  await expect(reportDialog).toBeVisible();
  await expect(reportDialog.getByLabel("Nombre del informe", { exact: true })).toHaveValue(
    "patient.card",
  );
  await expect(
    reportDialog.getByLabel("Identificadores de registros", { exact: true }),
  ).toHaveValue(String(patientId));
  await expect(reportDialog.getByLabel("Modelo para análisis", { exact: true })).toHaveValue(
    "gnuhealth.patient",
  );

  const patientCardResponse = waitForModelResponse("report.patient.card.execute");
  await reportDialog.getByRole("button", { name: "Vista previa", exact: true }).click();
  const patientCardExecuted = await patientCardResponse;
  const patientCardRequest = patientCardExecuted.request().postDataJSON() as {
    params?: unknown[];
  };
  const patientCardPayload = (await patientCardExecuted.json()) as {
    error?: unknown;
    result?: unknown[];
  };
  const patientCardData = patientCardRequest.params?.[1] as Record<string, unknown> | undefined;
  const patientCardContext = patientCardRequest.params?.[2] as Record<string, unknown> | undefined;
  expect(patientCardRequest.params?.[0]).toEqual([patientId]);
  expect(patientCardData).toMatchObject({
    action_id: expect.any(Number),
    model: "gnuhealth.patient",
  });
  expect(patientCardContext).toMatchObject({
    action_id: patientCardData?.action_id,
    active_id: patientId,
    active_ids: [patientId],
    active_model: "gnuhealth.patient",
    language: "es",
  });
  expect(patientCardPayload.error).toBeUndefined();
  expect(patientCardPayload.result?.[0]).toBe("pdf");
  expect(patientCardPayload.result?.[1]).toMatchObject({
    __class__: "bytes",
    base64: expect.any(String),
  });
  expect(patientCardPayload.result?.[2]).toEqual(expect.any(Boolean));
  expect(patientCardPayload.result?.[3]).toEqual(expect.any(String));
  const patientCardBytes = Buffer.from(
    String((patientCardPayload.result?.[1] as Record<string, unknown> | undefined)?.base64 ?? ""),
    "base64",
  ).byteLength;
  expect(patientCardBytes, "GNU Health must return a non-empty patient card PDF").toBeGreaterThan(
    100,
  );
  await expect(
    reportDialog.getByRole("status").filter({
      hasText: `Vista previa de ${patientCardBytes} bytes (pdf)`,
    }),
  ).toBeVisible();
  await expect(reportDialog.getByLabel("Vista previa del informe", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const evidence = {
    environmentKind: "synthetic-gnu-health",
    language: "es",
    clinicalModels: [
      ...clinicalWorkspaces.map(([, model]) => model),
      "gnuhealth.patient.evaluation",
      "gnuhealth.vaccination",
    ],
    emptyClinicalLists: true,
    openedUnsavedPatientForm: true,
    patientLifecycle: {
      created: true,
      concurrencyConflictRejected: true,
      concurrencyLatestValuePreserved: true,
      concurrencyTimestampRefreshed: true,
      read: true,
      updated: true,
      persistedClinicalNote: true,
      retainedForFixtureCleanup: true,
    },
    appointmentLifecycle: {
      appointmentId,
      created: true,
      defaultState: "confirmed",
      patientLinked: patientId,
      checkedIn: true,
      deleted: true,
    },
    prescriptionLifecycle: {
      prescriptionId,
      created: true,
      defaultState: "draft",
      patientLinked: patientId,
      medicament: syntheticMedicamentName,
      safetyWarningAcknowledged: true,
      finalized: true,
      immutable: true,
      pageOfLifeDelegatedToFixture: true,
      retainedForFixtureCleanup: true,
    },
    vaccinationLifecycle: {
      vaccinationId,
      created: true,
      defaultState: "in_progress",
      patientLinked: patientId,
      vaccine: syntheticVaccineName,
      vaccineLot: syntheticVaccineLot,
      finalized: true,
      immutable: true,
      pageOfLifeDelegatedToFixture: true,
      retainedForFixtureCleanup: true,
    },
    patientReportLifecycle: {
      report: "patient.card",
      actionId: patientCardData?.action_id,
      recordId: patientId,
      outputExtension: patientCardPayload.result?.[0],
      outputBytes: patientCardBytes,
      backendFilename: patientCardPayload.result?.[3],
      backendOwnedFormat: true,
      previewed: true,
    },
    evaluationLifecycle: {
      actionContextPatient: patientId,
      created: true,
      defaultType: "outpatient",
      defaultState: "in_progress",
      evaluationId,
      patientLinked: patientId,
      updated: true,
      deleteAllowed: false,
      deleteControlDisabled: true,
      retainedForFixtureCleanup: true,
    },
    writesPerformed: true,
    syntheticOnly: true,
    browserCleanupVerifiedForDeletableRecords: true,
    protectedClinicalCleanupDelegatedToFixture: true,
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

test("Epiton enforces the GNU Health core role journeys returned by Tryton", async ({
  browser,
}, testInfo) => {
  test.skip(!syntheticCoreLab, "requires the disposable synthetic GNU Health core laboratory");
  test.setTimeout(360_000);

  const trytonBaseUrl = process.env.EPITON_BASE ?? "http://127.0.0.1:58001";
  const database =
    process.env.EPITON_GH_ROLE_DB ?? process.env.EPITON_DB ?? "epiton_health_core_roles";
  const adminPassword = process.env.EPITON_PASSWORD ?? "epiton-health-synthetic-admin";
  const rolePassword = process.env.EPITON_GH_ROLE_PASSWORD ?? "epiton-health-synthetic-role";
  const webBaseUrl = testInfo.project.use.baseURL;
  if (typeof webBaseUrl !== "string") {
    throw new Error("the GNU Health browser gate requires Playwright use.baseURL");
  }

  for (const profile of roleProfiles) {
    const context = await browser.newContext({ baseURL: webBaseUrl });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];
    const failedRequests: string[] = [];
    const verifiedWorkspaces: Array<{
      access: RoleAccess;
      menu: string;
      model: string;
    }> = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(
          `${response.status()} ${response.request().method()} ${response.url()}`,
        );
      }
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
      );
    });

    try {
      await page.goto("/", { waitUntil: "networkidle" });
      await page.getByLabel("Language").selectOption("es");
      await page.getByLabel("Servidor", { exact: true }).fill(trytonBaseUrl);
      await page.getByLabel("Base de datos", { exact: true }).fill(database);
      await page.getByLabel("Usuario", { exact: true }).fill(profile.login);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill(profile.key === "admin" ? adminPassword : rolePassword);
      await page.getByRole("button", { name: "Entrar a Epiton", exact: true }).click();

      const sidebar = page.getByRole("complementary", { name: "Menú", exact: true });
      await expect(sidebar).toBeVisible({ timeout: 30_000 });
      const escapedLogin = profile.login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await expect(sidebar.getByText(new RegExp(`^${escapedLogin} · layout \\S+$`))).toBeVisible();

      for (const menu of profile.visibleMenus) {
        await expect(sidebar.getByRole("button", { name: menu, exact: true }).last()).toBeVisible();
      }
      for (const menu of profile.expandBeforeHidden ?? []) {
        await sidebar.getByRole("button", { name: menu, exact: true }).last().click();
      }
      for (const menu of profile.hiddenMenus) {
        await expect(sidebar.getByRole("button", { name: menu, exact: true })).toHaveCount(0);
      }

      for (const workspace of profile.workspaces) {
        if (workspace.parent) {
          await sidebar.getByRole("button", { name: workspace.parent, exact: true }).last().click();
        }
        const accessResponsePromise = isModelAccessResponse(page, workspace.model);
        await sidebar.getByRole("button", { name: workspace.menu, exact: true }).last().click();
        const accessResponse = await accessResponsePromise;
        const accessPayload = (await accessResponse.json()) as {
          error?: unknown;
          result?: Record<string, RoleAccess>;
        };
        expect(accessPayload.error).toBeUndefined();
        expect(accessPayload.result?.[workspace.model]).toMatchObject(workspace.access);
        await expect(
          page.getByRole("heading", { name: workspace.model, exact: true }),
        ).toBeVisible();

        const newButton = page.getByRole("button", { name: "Nuevo", exact: true }).first();
        const importButton = page
          .getByRole("button", { name: "Importar CSV", exact: true })
          .first();
        if (workspace.access.create) {
          await expect(newButton).toBeEnabled();
          await expect(importButton).toBeEnabled();
        } else {
          await expect(newButton).toBeDisabled();
          await expect(importButton).toBeDisabled();
        }

        verifiedWorkspaces.push({
          access: workspace.access,
          menu: workspace.menu,
          model: workspace.model,
        });
      }

      await testInfo.attach(`gnu-health-role-${profile.key}`, {
        body: Buffer.from(
          JSON.stringify(
            {
              environmentKind: "synthetic-gnu-health",
              language: "es",
              login: profile.login,
              visibleMenus: profile.visibleMenus,
              hiddenMenus: profile.hiddenMenus,
              verifiedWorkspaces,
              writesPerformed: false,
              syntheticOnly: true,
              containsPhi: false,
              consoleErrors,
              pageErrors,
              failedResponses,
              failedRequests,
            },
            null,
            2,
          ),
        ),
        contentType: "application/json",
      });

      expect(
        consoleErrors,
        `${profile.key}: browser console errors\nfailed responses:\n${failedResponses.join("\n")}\nfailed requests:\n${failedRequests.join("\n")}`,
      ).toEqual([]);
      expect(pageErrors, `${profile.key}: uncaught page errors`).toEqual([]);
      expect(failedResponses, `${profile.key}: HTTP responses with status >= 400`).toEqual([]);
      expect(failedRequests, `${profile.key}: requests that failed before a response`).toEqual([]);

      await page.getByRole("button", { name: "Salir", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Entrar a Epiton", exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  }
});
