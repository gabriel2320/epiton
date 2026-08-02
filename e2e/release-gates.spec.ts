import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { installMockTryton } from "./support/mockTryton";

type ReleaseBudgets = {
  accessibility: {
    duplicateIds: number;
    unnamedInteractiveNodes: number;
  };
  performance: {
    navigationDomContentLoadedMs: number;
    loginToShellMs: number;
    menuToWorkspaceMs: number;
    maxDomNodes: number;
    maxSingleLongTaskMs: number;
    maxTotalLongTaskMs: number;
    maxCumulativeLayoutShift: number;
  };
};

type BrowserReleaseMetrics = {
  cumulativeLayoutShift: number;
  longTasks: number[];
};

type AccessibilityNode = {
  backendDOMNodeId?: number;
  ignored?: boolean;
  name?: { value?: unknown };
  role?: { value?: unknown };
};

const budgets = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/client-release-budgets.json"), "utf8"),
) as ReleaseBudgets;

const interactiveRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & { __epitonReleaseMetrics?: BrowserReleaseMetrics };
    const metrics: BrowserReleaseMetrics = {
      cumulativeLayoutShift: 0,
      longTasks: [],
    };
    target.__epitonReleaseMetrics = metrics;

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Chromium is the release-gate browser. An unsupported observer leaves a
      // deterministic zero and the timing budgets below remain active.
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!shift.hadRecentInput) metrics.cumulativeLayoutShift += shift.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // See the long-task observer note above.
    }
  });
}

async function accessibilitySnapshot(page: Page): Promise<{
  duplicateIds: string[];
  unnamedInteractiveNodes: Array<{ backendDOMNodeId?: number; role: string }>;
}> {
  const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
    const counts = new Map<string, number>();
    for (const element of elements) {
      if (element.id) counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
      .sort();
  });

  const session = await page.context().newCDPSession(page);
  const tree = (await session.send("Accessibility.getFullAXTree")) as {
    nodes?: AccessibilityNode[];
  };
  await session.detach();
  const unnamedInteractiveNodes = (tree.nodes ?? [])
    .filter((node) => {
      const role = String(node.role?.value ?? "");
      const name = String(node.name?.value ?? "").trim();
      return !node.ignored && interactiveRoles.has(role) && name.length === 0;
    })
    .map((node) => ({
      backendDOMNodeId: node.backendDOMNodeId,
      role: String(node.role?.value ?? "unknown"),
    }));

  return { duplicateIds, unnamedInteractiveNodes };
}

async function expectAccessiblePage(page: Page): Promise<void> {
  const snapshot = await accessibilitySnapshot(page);
  expect(snapshot.duplicateIds, "duplicate DOM ids").toHaveLength(
    budgets.accessibility.duplicateIds,
  );
  expect(
    snapshot.unnamedInteractiveNodes,
    "interactive accessibility nodes without names",
  ).toHaveLength(budgets.accessibility.unnamedInteractiveNodes);
}

test("primary client path meets accessibility and performance budgets", async ({
  page,
}, testInfo) => {
  await installPerformanceObservers(page);
  await installMockTryton(page);
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("form", { name: "Connect", exact: true })).toBeVisible();
  await expectAccessiblePage(page);

  await page.getByLabel("Database").fill("epiton_lab");
  await page.getByLabel("User").fill("admin");
  await page.getByLabel("Password").fill("admin");
  const loginStarted = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Enter Epiton" }).focus();
  await page.keyboard.press("Enter");

  const sidebar = page.getByRole("complementary", { name: "Menu" });
  await expect(sidebar).toBeVisible();
  const loginToShellMs = await page.evaluate(
    (started) => performance.now() - started,
    loginStarted,
  );

  const parties = sidebar.getByRole("button", { name: "Parties", exact: true }).first();
  const menuStarted = await page.evaluate(() => performance.now());
  await parties.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "party.party" })).toBeVisible();
  await expect(page.getByText("Synthetic Alpha").first()).toBeVisible();
  const menuToWorkspaceMs = await page.evaluate(
    (started) => performance.now() - started,
    menuStarted,
  );

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByLabel("Workspace preset")).toBeVisible();
  await expect(page.getByLabel("Workspace density")).toBeVisible();
  await expectAccessiblePage(page);

  const search = page.getByLabel("Domain search");
  await search.focus();
  await search.fill("Beta");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Synthetic Beta").first()).toBeVisible();

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const target = window as typeof window & { __epitonReleaseMetrics?: BrowserReleaseMetrics };
    const observed = target.__epitonReleaseMetrics ?? {
      cumulativeLayoutShift: 0,
      longTasks: [],
    };
    return {
      cumulativeLayoutShift: observed.cumulativeLayoutShift,
      domNodes: document.querySelectorAll("*").length,
      longTasks: observed.longTasks,
      navigationDomContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
    };
  });
  const maxSingleLongTaskMs = Math.max(0, ...metrics.longTasks);
  const totalLongTaskMs = metrics.longTasks.reduce((total, duration) => total + duration, 0);
  const receipt = {
    ...metrics,
    loginToShellMs,
    maxSingleLongTaskMs,
    menuToWorkspaceMs,
    totalLongTaskMs,
  };
  await testInfo.attach("client-release-metrics.json", {
    body: Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
    contentType: "application/json",
  });
  console.info(`client-release-metrics ${JSON.stringify(receipt)}`);

  expect(metrics.navigationDomContentLoadedMs).toBeLessThanOrEqual(
    budgets.performance.navigationDomContentLoadedMs,
  );
  expect(loginToShellMs).toBeLessThanOrEqual(budgets.performance.loginToShellMs);
  expect(menuToWorkspaceMs).toBeLessThanOrEqual(budgets.performance.menuToWorkspaceMs);
  expect(metrics.domNodes).toBeLessThanOrEqual(budgets.performance.maxDomNodes);
  expect(maxSingleLongTaskMs).toBeLessThanOrEqual(budgets.performance.maxSingleLongTaskMs);
  expect(totalLongTaskMs).toBeLessThanOrEqual(budgets.performance.maxTotalLongTaskMs);
  expect(metrics.cumulativeLayoutShift).toBeLessThanOrEqual(
    budgets.performance.maxCumulativeLayoutShift,
  );
});
