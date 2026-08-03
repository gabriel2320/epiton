import { expect, test } from "@playwright/test";
import { installMockTryton } from "./support/mockTryton";

test.beforeEach(async ({ page }) => {
  await installMockTryton(page);
});

function nonceFrom(policy: string): string {
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce, "CSP must carry a nonce source").toBeTruthy();
  return nonce ?? "";
}

test("Next host binds scripts and security headers to each request", async ({ page, request }) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy|refused to/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });

  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response?.headers() ?? {};
  const policy = headers["content-security-policy"] ?? "";
  const nonce = nonceFrom(policy);

  expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
  expect(policy).toContain("script-src-attr 'none'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy.split("; ").find((directive) => directive.startsWith("script-src "))).not.toContain(
    "'unsafe-inline'",
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");

  await expect(page.getByText("Epiton").first()).toBeVisible();
  const scriptNonces = await page
    .locator("script")
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  // Next applies the request nonce to its bootstrap scripts. Scripts loaded by
  // that trusted bootstrap may omit it because strict-dynamic delegates trust.
  expect(scriptNonces).toContain(nonce);
  expect(scriptNonces.filter(Boolean).every((scriptNonce) => scriptNonce === nonce)).toBe(true);
  expect(cspViolations).toEqual([]);

  const secondResponse = await request.get("/");
  const secondPolicy = secondResponse.headers()["content-security-policy"] ?? "";
  expect(nonceFrom(secondPolicy)).not.toBe(nonce);
  expect(secondResponse.headers()["x-nonce"]).toBeUndefined();
});

test("Next PWA installs while Cache Storage remains static-only", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(await manifestResponse.json()).toMatchObject({
    name: "Epiton",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText("Epiton").first()).toBeVisible();

  await page.getByLabel("Database").fill("epiton_lab");
  await page.getByLabel("User").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Enter Epiton" }).click();
  await expect(
    page.locator("aside").getByRole("button", { name: "Parties", exact: true }).first(),
  ).toBeVisible();

  const cacheSnapshot = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = (
      await Promise.all(
        names.map(async (name) => {
          const cache = await caches.open(name);
          return (await cache.keys()).map((request) => new URL(request.url).pathname);
        }),
      )
    ).flat();
    return { names, entries };
  });

  expect(cacheSnapshot.names).toEqual(["epiton-next-static-v1"]);
  expect(cacheSnapshot.entries.length).toBeGreaterThan(0);
  expect(
    cacheSnapshot.entries.every(
      (path) => path.startsWith("/_next/static/") || path === "/epiton.svg",
    ),
  ).toBe(true);
  expect(cacheSnapshot.entries).not.toContain("/");
  expect(cacheSnapshot.entries).not.toContain("/epiton_lab/");
});
