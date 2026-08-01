import { type Page, expect, test } from "@playwright/test";
import { type MockTryton, installMockTryton } from "./support/mockTryton";

type JsonObject = Record<string, unknown>;

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Database").fill("epiton_lab");
  await page.getByLabel("User").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Enter Epiton" }).click();
  await expect(page.getByRole("tab", { name: "party.party" })).toBeVisible();
}

async function openCalendar(page: Page, mock: MockTryton) {
  await page
    .locator("aside")
    .getByRole("button", { name: "Synthetic Calendar", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "synthetic.calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const calendar = page.locator(".epiton-calendar");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByText("Synthetic Calendar Alpha", { exact: true })).toBeVisible();
  await expect(
    calendar.locator(`.fc-daygrid-day[data-date="${mock.calendarDates.initial}"]`),
  ).toBeVisible();
  return calendar;
}

async function dragInitialEvent(page: Page, mock: MockTryton) {
  const calendar = page.locator(".epiton-calendar");
  const source = calendar.locator(".fc-event").filter({ hasText: "Synthetic Calendar Alpha" });
  const target = calendar.locator(
    `.fc-daygrid-day[data-date="${mock.calendarDates.move}"] .fc-daygrid-day-frame`,
  );
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.dragTo(target);
}

test("calendar click-create and pointer drag persist parsed date fields", async ({ page }) => {
  const mock = await installMockTryton(page, { includeCalendar: true });
  await login(page);
  const calendar = await openCalendar(page, mock);

  const createCell = calendar.locator(
    `.fc-daygrid-day[data-date="${mock.calendarDates.create}"] .fc-daygrid-day-frame`,
  );
  await createCell.click({ position: { x: 12, y: 36 } });

  await expect.poll(() => mock.calendarRecords.get(202)?.starts_at).toBe(mock.calendarDates.create);
  await expect(page.getByText("Created #202", { exact: true })).toBeVisible();
  await expect(calendar.getByText("Synthetic created", { exact: true })).toBeVisible();

  const createCall = mock.calls.find((call) => call.method === "model.synthetic.calendar.create");
  const createEnvelope = createCall?.params[0];
  const createValues = Array.isArray(createEnvelope)
    ? (createEnvelope[0] as JsonObject | undefined)
    : undefined;
  expect(createValues?.starts_at).toBe(mock.calendarDates.create);
  expect(createValues?.name).toBe("Synthetic created");
  expect(mock.calls.some((call) => call.method === "model.synthetic.calendar.default_get")).toBe(
    true,
  );

  await dragInitialEvent(page, mock);
  await expect
    .poll(() => mock.calls.find((call) => call.method === "model.synthetic.calendar.write"))
    .toBeTruthy();

  const writeCall = mock.calls.find((call) => call.method === "model.synthetic.calendar.write");
  expect(writeCall?.params[0]).toEqual([201]);
  const writeValues = writeCall?.params[1] as JsonObject | undefined;
  expect(String(writeValues?.starts_at)).toContain(mock.calendarDates.move);
  await expect(page.getByText("Moved #201", { exact: true })).toBeVisible();
  expect(mock.calendarRecords.get(201)?.starts_at).toContain(mock.calendarDates.move);
});

test("calendar write rejection is surfaced and never reported as moved", async ({ page }) => {
  const mock = await installMockTryton(page, {
    includeCalendar: true,
    rejectCalendarWrite: true,
  });
  await login(page);
  await openCalendar(page, mock);

  await dragInitialEvent(page, mock);
  await expect
    .poll(
      () => mock.calls.filter((call) => call.method === "model.synthetic.calendar.write").length,
    )
    .toBe(1);
  await expect(page.getByText("Synthetic calendar write forbidden", { exact: true })).toBeVisible();
  await expect(page.getByText("Moved #201", { exact: true })).toHaveCount(0);
  await expect(
    page
      .locator(`.fc-daygrid-day[data-date="${mock.calendarDates.initial}"]`)
      .getByText("Synthetic Calendar Alpha", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(`.fc-daygrid-day[data-date="${mock.calendarDates.move}"]`)
      .getByText("Synthetic Calendar Alpha", { exact: true }),
  ).toHaveCount(0);
  expect(mock.calendarRecords.get(201)?.starts_at).toBe(`${mock.calendarDates.initial} 09:00:00`);
});
