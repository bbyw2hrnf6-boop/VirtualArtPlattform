import { expect, test, type Page } from "@playwright/test";

test("an open Explore menu removes a guest at the exact deadline even if its repository result is cached", async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Local contract fixture only.");
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const guest = { id: "guest-timed", title: "Material Interval", artist: "Field Studio", templateId: "white-cube",
    guestPublication: true, visibility: "public", lifecycleStatus: "active", discoverEligible: true, exploreListed: true,
    creatorProfileListed: false, publishedAt: new Date(now - 7 * 86_400_000 + 60_000).toISOString(),
    expiresAt: new Date(now + 365 * 86_400_000).toISOString(), artworks: [{ src: "/assets/artworks/aura-cliffs-study.webp" }] };
  await page.route("**/assets/firebaseGalleryRepository-*.js", route => route.fulfill({ contentType: "text/javascript", body:
    `export const firebaseGalleryRepository={currentSession:async()=>null,currentUserId:async()=>null,discover:async()=>[${JSON.stringify(guest)}]};` }));
  await page.route("https://firestore.googleapis.com/**", route => route.abort());
  await page.goto("/?explore=spaces");
  const card = page.locator('.space-menu a[href$="/spaces/guest-timed"]');
  await expect(card).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Enter the work." })).toBeVisible();
});

// Only the local test browser sees these backend responses. No production
// bypass, public fixture, upload or Firebase mutation is created.
async function installGuestFixture(page: Page) {
  const uid = "fixture-guest";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: uid, user_id: uid,
    auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: "anonymous" } })}.test-only`;
  const calls: string[] = [];
  let distribution: unknown;
  const publishedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
  await page.route("https://identitytoolkit.googleapis.com/**", route => route.fulfill({ json: {
    localId: uid, idToken: token, refreshToken: "test-only", expiresIn: "3600",
    users: [{ localId: uid, emailVerified: false, providerUserInfo: [] }],
  } }));
  await page.route("https://securetoken.googleapis.com/**", route => route.fulfill({ json: {
    access_token: token, id_token: token, refresh_token: "test-only", expires_in: "3600", user_id: uid,
  } }));
  await page.route("https://firestore.googleapis.com/**", route => route.abort());
  await page.route("https://firebasestorage.googleapis.com/**", route => route.abort());
  await page.route("https://europe-west1-virtualartplattform.cloudfunctions.net/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const { data } = route.request().postDataJSON();
    calls.push(name);
    if (name === "beginAuraGalleryPublication") {
      expect(data.visibility).toBe("public");
      await route.fulfill({ json: { result: { expiresAt, retention: "account-preview", guestPublication: true } } });
    } else if (name === "uploadAuraGalleryAsset") {
      const suffix = data.kind === "cover" ? "cover.webp" : `artworks/${data.index + 1}.webp`;
      await route.fulfill({ json: { result: { path: `published/${uid}/${data.galleryId}/${suffix}`,
        bytes: Buffer.from(data.bytesBase64, "base64").length, idempotent: false } } });
    } else if (name === "finalizeAuraGalleryPublication") {
      distribution = data.distribution;
      await route.fulfill({ json: { result: { publishedAt, updatedAt: publishedAt, expiresAt, revision: 1, guestPublication: true } } });
    } else await route.fulfill({ status: 403, json: { error: { status: "PERMISSION_DENIED", message: "Outside guest fixture" } } });
  });
  return { calls, distribution: () => distribution };
}

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`guest publish is explicit, profile-free and recoverable on ${name}`, async ({ page }) => {
    test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), "Local contract fixture only.");
    const fixture = await installGuestFixture(page);
    await page.setViewportSize(viewport);
    await page.goto("/#/create/white-cube/demo");
    await expect(page.locator(".studio .gallery-scene")).toHaveAttribute("data-arrival", "ready");
    if (name === "mobile") await page.getByRole("button", { name: "Edit more", exact: true }).click();
    await page.getByRole("textbox", { name: "Project title", exact: true }).fill("Guest Material Study");
    await page.getByRole("textbox", { name: "Creator name", exact: true }).fill("Field Studio");
    await page.getByRole("button", { name: /Review & publish/ }).click();
    const review = page.locator(".publish-review");
    await expect(review.getByText("Publish as a guest. No signup needed.")).toBeVisible();
    await expect(review.getByText(/Up to 7 days in Explore from your first publication/)).toBeVisible();
    await expect(review.getByText("Show in Creator Hub", { exact: true })).toHaveCount(0);
    await expect(review.getByRole("radio")).toHaveCount(0);
    await expect(review.getByRole("button", { name: "Publish as guest", exact: true })).toBeEnabled();
    await page.screenshot({ path: `artifacts/guest-review-${name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await review.getByRole("button", { name: "Publish as guest", exact: true }).click();
    await expect(page.locator(".publish-success")).toBeVisible();
    await expect(page.getByText(/Published as a guest, without a public profile/)).toBeVisible();
    await expect(page.getByText(/Your direct link stays live until/)).toBeVisible();
    expect(fixture.calls).toContain("finalizeAuraGalleryPublication");
    expect(fixture.distribution()).toEqual({ exploreListed: true, creatorProfileListed: false });
    await page.screenshot({ path: `artifacts/guest-success-${name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Back to editor", exact: true }).click();
    await page.getByRole("button", { name: /Review.*update|Review & publish|Update live/ }).click();
    await expect(page.getByText("Create an account to update this Space.", { exact: true })).toBeVisible();
  });
}
