import { expect, test, type Page } from "@playwright/test";
import type { AdminDashboard, AdminSession, AdminSource } from "../../src/services/adminConsoleTypes";

// Contract fixtures live only in the test runner. Production has no admin bypass.
const stamp = "2026-09-11T12:00:00.000Z";
const ok = <T>(data: T): AdminSource<T> => ({ status: "ok", fetchedAt: stamp, cached: false, data });
const session: AdminSession = {
  schemaVersion: 1, generatedAt: stamp,
  principal: { uid: "fixture-admin", email: "admin@example.test", displayName: "Test Administrator", role: "owner" },
  canManageAccess: true,
};
const dashboard: AdminDashboard = {
  schemaVersion: 1, generatedAt: stamp,
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
  checks: ok({ historyLimit: 10, runs: [] }),
  access: ok({ memberLimit: 100, members: [{ ...session.principal, active: true, createdAt: stamp, updatedAt: stamp }] }),
};

async function installAdminFixture(page: Page, role: "owner" | "admin" | "denied" = "owner") {
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
        : { json: { result: { ...dashboard, access: role === "owner" ? dashboard.access : null } } });
    } else if (name === "runLieuvaAdminChecks") {
      await route.fulfill({ json: { result: { schemaVersion: 1, run: { id: "fixture-check", startedAt: stamp, completedAt: stamp, overall: "passed", checks: [
        { target: "home", url: "https://lieuva.com/", expectedStatus: 200, actualStatus: 200, status: "passed", durationMs: 100 },
      ] } } } });
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
