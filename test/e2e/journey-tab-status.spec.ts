import { test, expect, type Page } from "@playwright/test";
import { startRunningTurn, uniq } from "./helpers";

/**
 * Journey: live status in the browser tab (#958 part 3).
 *
 * The title prefix and favicon dot ride the real `chat:active` stream, so only
 * this tier proves a real turn reaches them — and that they CLEAR when it lands,
 * which is the half a unit test with a fake running set can't see. The e2e
 * instance runs the default brand, so "cleared" means the shipped PNG is back.
 *
 * The hidden-tab case fakes `document.visibilityState` (Playwright has no
 * background-tab switch for a single page) and fires the real event, which is
 * exactly what the app listens to.
 */

const icon32 = (page: Page) =>
  page.locator('link[rel~="icon"][sizes="32x32"]').getAttribute("href");

async function createProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/projects", {
    data: { name, status: "active", domain: [] },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).project.slug as string;
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("a running turn prefixes the chat's title with ● and dots the favicon; both clear when it lands", async ({
  page,
}) => {
  const name = uniq("TS Run");
  const slug = await createProject(page, name);
  await startRunningTurn(page, { slug, marker: uniq("tsrun") });

  await expect(page).toHaveTitle(/^● .* · TS Run/, { timeout: 15_000 });
  await expect.poll(() => icon32(page)).toMatch(/^data:image\/png/);

  // [[SLOWTOOL]] holds for ~12s; once it lands the status is gone entirely.
  await expect(page.getByRole("button", { name: /Stop/ })).toBeHidden({ timeout: 40_000 });
  await expect(page).not.toHaveTitle(/^[●✓(]/);
  await expect.poll(() => icon32(page)).toBe("/icons/favicon-32.png");
});

test("a project page and root Home show ● while one of its chats runs", async ({ page }) => {
  const name = uniq("TS Proj");
  const slug = await createProject(page, name);
  await startRunningTurn(page, { slug, marker: uniq("tsproj") });
  // In-app navigation only — a reload would drop the socket and the running set.
  await page.getByTestId("workspace-tabs").getByRole("button", { name: /^Home/ }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${slug}/home$`));
  await expect(page).toHaveTitle(new RegExp(`^● ${name} — `), { timeout: 15_000 });

  // Root Home aggregates the instance. The shared e2e server may hold other
  // tests' unread chats, so the count is matched loosely.
  await page.getByRole("complementary").getByRole("link", { name: /^Home/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/^● (\(\d+\) )?/, { timeout: 15_000 });
  await expect.poll(() => icon32(page)).toMatch(/^data:image\/png/);
});

test("a reply landing in a hidden tab shows ✓ until the tab is shown, then clears", async ({ page }) => {
  const name = uniq("TS Hidden");
  const slug = await createProject(page, name);
  await startRunningTurn(page, { slug, marker: uniq("tshid") });
  await expect(page).toHaveTitle(/^● /, { timeout: 15_000 });

  await setHidden(page, true);
  await expect(page.getByRole("button", { name: /Stop/ })).toBeHidden({ timeout: 40_000 });
  // Nobody watched it land: ✓ and a green (non-shipped) favicon.
  await expect(page).toHaveTitle(/^✓ .* · TS Hidden/, { timeout: 10_000 });
  await expect.poll(() => icon32(page)).toMatch(/^data:image\/png/);

  await setHidden(page, false);
  await expect(page).not.toHaveTitle(/^[●✓(]/, { timeout: 10_000 });
  await expect.poll(() => icon32(page)).toBe("/icons/favicon-32.png");
});
