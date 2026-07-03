import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function widgets({ browser, base }) {
  const { step, failures } = makeStepper();

  // --- on-screen keyboard (touch context) ---
  const touchCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });
  const kbPage = await touchCtx.newPage();
  await kbPage.addInitScript(() => localStorage.setItem("hearth-osk", "on"));
  await seedView(base, [
    { i: "grocery-1", widget: "grocery", x: 0, y: 0, w: 4, h: 4, config: {} },
  ]);
  await kbPage.goto(base);
  await kbPage.waitForSelector(".widget-card");
  await kbPage.locator('input[placeholder="Add item…"]').click();
  await kbPage.waitForSelector(".osk-dock", { timeout: 5000 });
  step("keyboard appears on focus", true);
  for (const key of ["{shift}", "M", "i", "l", "k"]) {
    await kbPage.locator(`.osk-dock .hg-button[data-skbtn="${key}"]`).click();
    await kbPage.waitForTimeout(60);
  }
  step(
    "keys write into input",
    (await kbPage.locator('input[placeholder="Add item…"]').inputValue()) === "Milk",
  );
  await kbPage.locator('.osk-dock .hg-button[data-skbtn="{enter}"]').click();
  await kbPage.waitForTimeout(600);
  const items = await (await fetch(`${base}/api/widgets/grocery`)).json();
  step("return submits", items.some((i) => i.name === "Milk"));
  await touchCtx.close();

  // --- widget mutations must not depend on SSE for their own feedback ---
  // Regression: adds/toggles used to rely solely on the SSE topic to refresh,
  // so with a dead stream the data saved but the screen never showed it.
  await seedView(base, [{ i: "gb-1", widget: "guestbook", x: 0, y: 0, w: 6, h: 6, config: {} }]);
  await fetch(`${base}/api/widgets/guestbook`, {
    method: "POST",
    body: JSON.stringify({ author: "e2e", message: "Sticky", color: "yellow" }),
  });
  const sseCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const ssePage = await sseCtx.newPage();
  await ssePage.route("**/api/stream", (r) => r.abort());
  await ssePage.goto(base);
  await ssePage.waitForSelector(".sticky-note");
  const notesBefore = await ssePage.locator(".sticky-note").count();
  await ssePage.locator('[aria-label="Leave a note"]').click();
  await ssePage.getByLabel("Your note").fill("n".repeat(280));
  await ssePage.locator('button:has-text("Stick it")').click();
  await ssePage.waitForTimeout(800);
  step(
    "note renders with SSE down (280 chars)",
    (await ssePage.locator(".sticky-note").count()) === notesBefore + 1,
  );
  await sseCtx.close();

  // --- profiles: assignee avatars render and deletes unassign live ---
  const riley = await (
    await fetch(`${base}/api/profiles`, {
      method: "POST",
      body: JSON.stringify({ name: "Riley", color: "#4F6DF5" }),
    })
  ).json();
  await seedView(base, [{ i: "chores-1", widget: "chores", x: 0, y: 0, w: 5, h: 6, config: {} }]);
  await fetch(`${base}/api/widgets/chores`, {
    method: "POST",
    body: JSON.stringify({ title: "Feed the cat", everyDays: 1, assigneeId: riley.id }),
  });
  const profCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const profPage = await profCtx.newPage();
  await profPage.goto(base);
  await profPage.waitForSelector(".widget-card");
  step(
    "assignee avatar renders",
    (await profPage.locator('.widget-card [aria-label="Riley"]').count()) === 1,
  );
  await fetch(`${base}/api/profiles/${riley.id}`, { method: "DELETE" });
  await profPage.waitForTimeout(800);
  step(
    "profile delete unassigns live",
    (await profPage.locator('.widget-card [aria-label="Riley"]').count()) === 0,
  );
  const unassigned = await (await fetch(`${base}/api/widgets/chores`)).json();
  step(
    "chore survives profile delete",
    unassigned.some((c) => c.title === "Feed the cat" && !c.assigneeId),
  );
  await profCtx.close();
  return failures();
}
