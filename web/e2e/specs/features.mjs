// Feature flows: view management, widget settings/config, calendar views,
// and the on-screen keyboard.
import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function features({ browser, base }) {
  const { step, failures } = makeStepper();
  const { page, errors } = await newPage(browser);

  await seedView(base, [
    { i: "clock-1", widget: "clock", x: 0, y: 0, w: 4, h: 3, config: {} },
    { i: "calendar-1", widget: "calendar", x: 4, y: 0, w: 8, h: 6, config: {} },
  ]);
  await page.goto(base);
  await page.waitForSelector(".widget-card");
  await page.locator('[aria-label="Edit layout"]').click();
  await page.waitForTimeout(300);

  // --- view management ---
  await page.locator('[aria-label="Manage views"]').click();
  await page.getByLabel("New view").fill("Kitchen");
  await page.locator('button:has-text("Add view")').click();
  await page.waitForTimeout(500);
  let views = await (await fetch(`${base}/api/views`)).json();
  step("create view", views.some((v) => v.name === "Kitchen"));
  await page.locator('button:has-text("Make default")').click();
  await page.waitForTimeout(500);
  views = await (await fetch(`${base}/api/views`)).json();
  step("set default view", views.find((v) => v.name === "Kitchen")?.isDefault === true);
  await page.locator('[aria-label="Delete Kitchen"]').click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Delete"):not([aria-label])').click();
  await page.waitForTimeout(500);
  views = await (await fetch(`${base}/api/views`)).json();
  step("delete promotes survivor", views.length === 1 && views[0].isDefault);
  step(
    "last view protected",
    await page.locator('[aria-label^="Delete"]').first().isDisabled(),
  );
  await page.locator('button:has-text("Close")').click();

  // --- widget settings persist config ---
  await page.locator('[aria-label="Clock settings"]').click();
  await page.locator("text=24-hour time").click();
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(600);
  let layout = await getLayout(base);
  step(
    "widget config persisted",
    layout.find((i) => i.widget === "clock")?.config?.hour24 === true,
  );
  await page.locator('[aria-label="Done editing"]').click();
  await page.waitForTimeout(300);

  // --- calendar view modes ---
  await page.getByLabel("Calendar view").click();
  await page.waitForTimeout(200);
  await page.getByText("Work week", { exact: true }).last().click();
  await page.waitForTimeout(500);
  step("work week renders 5 columns", (await page.locator(".cal-week-col").count()) === 5);
  layout = await getLayout(base);
  step(
    "calendar view persisted",
    layout.find((i) => i.widget === "calendar")?.config?.view === "workweek",
  );

  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();

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

  return failures();
}
