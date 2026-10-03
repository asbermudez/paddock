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

/**
 * Like `startRunningTurn`, but the second turn is `[[HANG]]`: it runs until it is
 * killed, so assertions that need "running" have no window to race. The caller
 * MUST {@link killChat} at the end — DELETE cancels the live turn first (#731).
 */
async function startHangingTurn(page: Page, slug: string, marker: string): Promise<string> {
  await page.goto(`/projects/${slug}/chat`);
  await page.getByPlaceholder(/Message Claude/i).fill(marker);
  await page.getByRole("button", { name: /^Send$/ }).click();
  await expect(page.getByText(/Acknowledged:/).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForURL(/\/chat\/[a-z0-9-]+$/, { timeout: 30_000 });
  const sessionId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByPlaceholder(/Message Claude/i).fill("hold forever [[HANG]]");
  await page.getByRole("button", { name: /^Send$/ }).click();
  await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible({ timeout: 15_000 });
  return sessionId;
}

async function killChat(page: Page, slug: string, sessionId: string): Promise<void> {
  await page.request.delete(`/api/projects/${slug}/chats/${sessionId}`);
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
  const sessionId = await startHangingTurn(page, slug, uniq("tsproj"));
  try {
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
  } finally {
    await killChat(page, slug, sessionId);
  }
});

test("a reply landing in a hidden tab shows ✓ until the tab is shown, then the SERVER is told", async ({
  page,
}) => {
  const name = uniq("TS Hidden");
  const slug = await createProject(page, name);
  const sessionId = await startRunningTurn(page, { slug, marker: uniq("tshid") });
  // Hide straight away: [[SLOWTOOL]] gives ~12s, and the turn must land while hidden.
  await setHidden(page, true);

  // Every `/seen` POST for this chat, and whether the tab was hidden when it left.
  let hidden = true;
  const seenPosts: Array<{ hidden: boolean }> = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith(`/chats/${sessionId}/seen`)) seenPosts.push({ hidden });
  });

  await expect(page.getByRole("button", { name: /Stop/ })).toBeHidden({ timeout: 40_000 });
  // Nobody watched it land: ✓ and a green (non-shipped) favicon.
  await expect(page).toHaveTitle(/^✓ .* · TS Hidden/, { timeout: 10_000 });
  await expect.poll(() => icon32(page)).toMatch(/^data:image\/png/);
  // …and the server was NOT told it was seen.
  expect(seenPosts).toEqual([]);

  const seenSent = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith(`/chats/${sessionId}/seen`),
  );
  hidden = false;
  await setHidden(page, false);
  await expect(page).not.toHaveTitle(/^[●✓(]/, { timeout: 10_000 });
  await expect.poll(() => icon32(page)).toBe("/icons/favicon-32.png");
  expect((await seenSent).ok()).toBe(true);
  expect(seenPosts.length).toBeGreaterThan(0);
  expect(seenPosts.every((p) => !p.hidden)).toBe(true);

  // The server-side read state now says read: lastSeen is at or past the turn.
  const res = await page.request.get(`/api/projects/${slug}/chats`);
  const chat = (await res.json()).chats.find((c: { sessionId: string }) => c.sessionId === sessionId);
  expect(chat).toBeTruthy();
  expect(chat.unread ?? false).toBe(false);
  expect(chat.lastSeen).toBeGreaterThanOrEqual(Date.parse(chat.lastTurnCompletedAt));
});
