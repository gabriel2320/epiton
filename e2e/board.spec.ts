import { expect, test } from "@playwright/test";
import { installMockTryton } from "./support/mockTryton";

type JsonObject = Record<string, unknown>;

async function login(page: Parameters<typeof installMockTryton>[0]) {
  await page.goto("/");
  await page.getByLabel("Database").fill("epiton_lab");
  await page.getByLabel("User").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Enter Epiton" }).click();
  await expect(page.getByRole("tab", { name: "party.party" })).toBeVisible();
}

function rpcContext(params: unknown[]): JsonObject {
  const value = params.at(-1);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

test("board action opens through Shell and preserves foreign selection context", async ({
  page,
}) => {
  const mock = await installMockTryton(page, { includeBoard: true });
  await login(page);

  await page.locator("aside").getByRole("button", { name: "Synthetic Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Board · party.party" })).toBeVisible();

  const sourcePane = page.getByRole("heading", { name: "Source parties" }).locator("..");
  const targetPane = page.getByRole("heading", { name: "Target parties" }).locator("..");
  await expect(sourcePane.getByRole("button", { name: /Synthetic Alpha/ })).toBeVisible();
  await sourcePane.getByRole("button", { name: /Synthetic Alpha/ }).click();
  await expect(targetPane.getByText("filtered · party.party#1", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      mock.calls.some((call) => {
        if (call.method !== "model.party.party.search_read" || call.params[2] !== 60) {
          return false;
        }
        const context = rpcContext(call.params);
        const actions = context._actions as JsonObject | undefined;
        const source = actions?.["901"] as JsonObject | undefined;
        return (
          context.board_pane === "target" &&
          context.active_id === 1 &&
          JSON.stringify(context.active_ids) === "[1]" &&
          context.active_model === "party.party" &&
          source?.active_id === 1
        );
      }),
    )
    .toBe(true);

  mock.calls.length = 0;
  await targetPane.getByRole("button", { name: "Open", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Board · party.party" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "party.party", exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Beta").first()).toBeVisible();

  await expect
    .poll(() =>
      mock.calls.some((call) => {
        // BoardPane previews 60 rows; the shared ModelWorkspace host requests 80.
        // This prevents a late preview RPC from making the post-open proof pass.
        if (call.method !== "model.party.party.search_read" || call.params[2] !== 80) {
          return false;
        }
        const context = rpcContext(call.params);
        const actions = context._actions as JsonObject | undefined;
        const source = actions?.["901"] as JsonObject | undefined;
        return (
          context.board_context_marker === "preserved" &&
          context.active_id === 1 &&
          JSON.stringify(context.active_ids) === "[1]" &&
          context.active_model === "party.party" &&
          source?.active_id === 1
        );
      }),
    )
    .toBe(true);
});
