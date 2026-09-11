import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { AdminCheckRun, AdminDashboard, AdminSession, AdminSource } from "../../src/services/adminConsoleTypes";
import { FIXED_LIVE_CHECKS } from "../../functions/src/adminLiveChecks";

// Contract fixtures live only in the test runner. Production has no admin bypass.
const stamp = new Date().toISOString();
const ok = <T>(data: T): AdminSource<T> => ({ status: "ok", fetchedAt: stamp, cached: false, data });
const session: AdminSession = {
  schemaVersion: 1, generatedAt: stamp,
  principal: { uid: "fixture-admin", email: "admin@example.test", displayName: "Test Administrator", role: "owner" },
  canManageAccess: true,
};
const currentRun: AdminCheckRun = { id: "fixture-current", suiteVersion: 2, startedAt: stamp, completedAt: stamp, overall: "failed", checks: FIXED_LIVE_CHECKS.map(({ target, url, expectedStatus }) => ({
  target, url, expectedStatus, actualStatus: expectedStatus, durationMs: 125,
  status: target === "admin-shell" ? "failed" : "passed", evidence: target === "admin-shell" ? "privacy-headers" : "ok",
})) };
const legacyRun: AdminCheckRun = { ...currentRun, id: "fixture-legacy", suiteVersion: 1, overall: "passed", checks: currentRun.checks.slice(0, 4).map((check) => ({ ...check, evidence: "legacy" })) };
const dashboard: AdminDashboard = {
  schemaVersion: 1, generatedAt: stamp,
  release: ok({ schemaVersion: 1, commitSha: "a".repeat(40), builtAt: stamp }),
  content: ok({
    galleries: { total: 12, recentLimit: 20, recent: [{ resourceRef: "ab12cd34ef56", visibility: "public", lifecycleStatus: "active", templateId: "white-cube", revision: 2, updatedAt: stamp, expiresAt: null }] },
    creators: { total: 4, recentLimit: 20, recent: [{ resourceRef: "fe65dc43ba21", handle: "test-studio", isPublic: true, updatedAt: stamp }] },
  }),
  github: ok({ repository: "bbyw2hrnf6-boop/VirtualArtPlattform", runs: [
    { workflow: "Verify", runNumber: 33, status: "completed", conclusion: "success", headSha: "a".repeat(40), url: "https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/123", createdAt: stamp, updatedAt: stamp },
    { workflow: "Deploy", runNumber: 134, status: "completed", conclusion: "success", headSha: "a".repeat(40), url: "https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/456", createdAt: stamp, updatedAt: stamp },
  ] }),
  telemetry: ok({ clientReported: true, windowMinutes: 60, sampleLimit: 50, sampledEntries: 2, byKind: { three_milestone: 2 }, byOutcome: {}, recent: [
    { timestamp: stamp, kind: "three_milestone", outcome: null, severity: "INFO", durationMs: 1800, template: "white-cube", runtime: "published_viewer", stage: "interactive", viewport: "desktop" },
    { timestamp: stamp, kind: "three_milestone", outcome: null, severity: "INFO", durationMs: 3200, template: "white-cube", runtime: "published_viewer", stage: "interactive", viewport: "mobile" },
  ] }),
  checks: ok({ historyLimit: 10, runs: [currentRun, legacyRun] }),
  access: ok({ memberLimit: 100, members: [{ ...session.principal, active: true, createdAt: stamp, updatedAt: stamp }] }),
};

async function installAdminFixture(page: Page, role: "owner" | "admin" | "denied" = "owner", overrides: Partial<AdminDashboard> = {}) {
  let revoked = role === "denied";
  let dashboardRequests = 0;
  await page.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: "fixture-admin", user_id: "fixture-admin", email: "admin@example.test", email_verified: true, auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: "password" } })}.test-only`;
    localStorage.setItem("firebase:authUser:AIzaSyBGM4dcF_V9b04W3obwZp1NwMnTV9Ak80M:[DEFAULT]", JSON.stringify({
      uid: "fixture-admin", email: "admin@example.test", emailVerified: true, displayName: "Test Administrator", isAnonymous: false,
      providerData: [{ providerId: "password", uid: "admin@example.test", email: "admin@example.test", displayName: "Test Administrator", photoURL: null, phoneNumber: null }],
      stsTokenManager: { accessToken: token, refreshToken: "test-only-refresh", expirationTime: Date.now() + 3600000 },
      apiKey: "AIzaSyBGM4dcF_V9b04W3obwZp1NwMnTV9Ak80M", appName: "[DEFAULT]",
    }));
  });
  await page.route("https://identitytoolkit.googleapis.com/**", (route) => route.fulfill({ json: { users: [{
    localId: "fixture-admin", email: "admin@example.test", emailVerified: true, displayName: "Test Administrator",
    providerUserInfo: [{ providerId: "password", rawId: "admin@example.test", email: "admin@example.test" }],
  }] } }));
  await page.route("https://firestore.googleapis.com/**", (route) => route.abort());
  await page.route("https://europe-west1-virtualartplattform.cloudfunctions.net/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    if (name === "getLieuvaAdminSession") {
      await route.fulfill(revoked
        ? { status: 403, json: { error: { status: "PERMISSION_DENIED", message: "Administrator access is required." } } }
        : { json: { result: { ...session, principal: { ...session.principal, role }, canManageAccess: role === "owner" } } });
    } else if (name === "getLieuvaAdminDashboard") {
      dashboardRequests++;
      await route.fulfill(revoked
        ? { status: 403, json: { error: { status: "PERMISSION_DENIED", message: "Access revoked." } } }
        : { json: { result: { ...dashboard, ...overrides, access: role === "owner" ? dashboard.access : null } } });
    } else if (name === "runLieuvaAdminChecks") {
      await route.fulfill({ json: { result: { schemaVersion: 1, run: { ...currentRun, id: "fixture-check", overall: "passed", checks: currentRun.checks.map((check) => ({ ...check, status: "passed", evidence: "ok" })) } } } });
    } else await route.fulfill({ json: { result: {} } });
  });
  return { revoke: () => { revoked = true; }, setRole: (next: "owner" | "admin") => { role = next; }, dashboardRequests: () => dashboardRequests };
}

test("signed-out and non-admin visitors cannot see the admin navigation or data", async ({ page }) => {
  await page.goto("/admin/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('a[href="/admin/access"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run checks", exact: true })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow,noarchive");
  await page.goto("/admin/operations");
  await expect(page.getByRole("button", { name: "Export support report", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href="/admin/operations"]')).toHaveCount(0);
  const fixture = await installAdminFixture(page, "denied");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('a[href="/admin/access"]')).toHaveCount(0);
  expect(fixture.dashboardRequests()).toBe(0);
});

test("admin console renders actual contract data, checks and responsive navigation", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Contract fixtures run only against the local immutable build.");
  await installAdminFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/overview");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("12", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "artifacts/admin-overview-desktop.png", fullPage: true });
  await page.locator('a[href="/admin/diagnostics"]').first().click();
  await expect(page.getByRole("heading", { name: "Room diagnostics", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/admin-diagnostics-desktop.png", fullPage: true });
  await page.locator('a[href="/admin/tests"]').first().click();
  await expect(page.getByRole("heading", { name: "Tests", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run checks", exact: true }).click();
  await expect(page.getByText("fixture-check", { exact: false }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/admin-tests-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("revocation clears an already visible console and ordinary admins cannot manage access", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Contract fixtures run only against the local immutable build.");
  const fixture = await installAdminFixture(page, "admin");
  await page.goto("/admin/overview");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Grant access/ })).toHaveCount(0);
  fixture.revoke();
  await page.getByRole("button", { name: /Refresh/ }).first().click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(0);
  await expect(page.getByText("Test Administrator", { exact: true })).toHaveCount(0);
});

test("test center filters failures, explains contracts, switches legacy history and exports the selected run", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Test-only local contracts.");
  await installAdminFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/tests");
  await expect(page.locator(".admin-check-list > li")).toHaveCount(13);
  await page.getByLabel("Failures only").check();
  await expect(page.locator(".admin-check-list > li")).toHaveCount(1);
  await page.getByText("Expected contract & next step", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Inspect the raw response and Hosting/)).toBeVisible();
  await page.screenshot({ path: "artifacts/admin-tests-desktop.png", fullPage: true });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export selected run", exact: true }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.id).toBe("fixture-current");
  expect(exported.checks).toHaveLength(13);
  expect(exported).not.toHaveProperty("actorRef");
  await page.getByRole("combobox", { name: "Check run", exact: true }).selectOption("fixture-legacy");
  await expect(page.getByText("No failed check in this selected run.")).toBeVisible();
  await page.getByLabel("Failures only").uncheck();
  await expect(page.locator(".admin-check-list > li")).toHaveCount(4);
  await expect(page.getByText("Legacy HTTP-only suite", { exact: true })).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Check run", exact: true }).selectOption("fixture-current");
  await page.getByLabel("Failures only").check();
  await page.getByText("Expected contract & next step", { exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/admin-check-evidence-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("operations shows real source state and exports only safe data with copy-only tools", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Test-only local contracts.");
  await installAdminFixture(page, "admin");
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copiedCommand = text; } } }); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
  await expect(page.getByText("aaaaaaaaaaaa", { exact: true })).toBeVisible();
  await expect(page.getByText("Passed #33", { exact: true })).toBeVisible();
  await expect(page.getByText("Expiry not reported", { exact: true })).toBeVisible();
  await expect(page.locator(".admin-tool")).toHaveCount(6);
  await page.getByRole("button", { name: "Copy Firebase access rules", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-copied-command", "npm run test:firebase-rules");
  await expect(page.getByRole("status").filter({ hasText: "command copied" })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export support report", exact: true }).click();
  const content = await readFile((await (await downloadEvent).path())!, "utf8");
  const bundle = JSON.parse(content);
  expect(bundle).not.toHaveProperty("access");
  expect(content).not.toContain("admin@example.test");
  expect(content).not.toContain("fixture-admin");
  expect(bundle.checks).toHaveLength(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/admin-operations-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/admin-operations-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("operations never presents missing sources as healthy or invents a deployed version", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Test-only local contracts.");
  await installAdminFixture(page, "owner", { release: undefined, github: { status: "unavailable", reason: "rate-limit", cached: true, fetchedAt: stamp, data: null }, telemetry: { status: "unavailable", reason: "permission", cached: false, fetchedAt: stamp, data: null } });
  await page.goto("/admin/operations");
  await expect(page.getByText("GitHub · unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Release identity · unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Telemetry source unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("aaaaaaaaaaaa", { exact: true })).toHaveCount(0);
});

test("an existing session refreshes owner promotions and demotions without signing out", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Contract fixtures run only against the local immutable build.");
  const fixture = await installAdminFixture(page, "admin");
  await page.goto("/admin/access");
  await expect(page.getByRole("heading", { name: "Access", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Grant access", exact: true })).toHaveCount(0);
  fixture.setRole("owner");
  await page.getByRole("button", { name: "Refresh admin data", exact: true }).click();
  await expect(page.getByRole("button", { name: "Grant access", exact: true })).toBeVisible();
  fixture.setRole("admin");
  await page.getByRole("button", { name: "Refresh admin data", exact: true }).click();
  await expect(page.getByRole("button", { name: "Grant access", exact: true })).toHaveCount(0);
});

test("Account Settings reveals the admin entry only after the server confirms membership", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Contract fixtures run only against the local immutable build.");
  const fixture = await installAdminFixture(page);
  await page.goto("/#/account");
  await expect(page.locator(".account-admin-entry")).toBeVisible();
  fixture.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".account-admin-entry")).toHaveCount(0);
});
