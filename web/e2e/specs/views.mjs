import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function views({ browser, base }) {
  const { step, failures } = makeStepper();
  const { page, errors } = await newPage(browser);

  await seedView(base, [{ i: "clock-1", widget: "clock", x: 0, y: 0, w: 4, h: 3, config: {} }]);
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

  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();

  // --- dragging a widget onto an EMPTY board must work ---
  // Regression: react-grid-layout collapses to ~10px with no items, so
  // tray drags over the visibly empty board never hit a drop target.
  await fetch(`${base}/api/views/1`, {
    method: "PUT",
    body: JSON.stringify({ name: "Home", layout: [] }),
  });
  const dropCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const dropPage = await dropCtx.newPage();
  await dropPage.goto(base);
  await dropPage.waitForSelector(".grid-container");
  await dropPage.locator('[aria-label="Edit layout"]').click();
  await dropPage.waitForTimeout(300);
  const dt = await dropPage.evaluateHandle(() => new DataTransfer());
  await dropPage.locator('[draggable]:has-text("Clock")').first().dispatchEvent("dragstart", { dataTransfer: dt });
  for (const type of ["dragenter", "dragover", "drop"]) {
    await dropPage.evaluate(
      ({ type, dt }) => {
        const gc = document.querySelector(".grid-container").getBoundingClientRect();
        const x = gc.x + gc.width / 2;
        const y = gc.y + gc.height / 2;
        document
          .elementFromPoint(x, y)
          .dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      },
      { type, dt },
    );
  }
  await dropPage.waitForTimeout(700);
  step(
    "tray drag drops onto an empty board",
    (await dropPage.locator(".widget-card").count()) === 1,
  );
  await dropCtx.close();

  // --- scheduled views: window takes over at rest, guest mode still wins ---
  const schedView = await (
    await fetch(`${base}/api/views`, {
      method: "POST",
      body: JSON.stringify({
        name: "Sched",
        layout: [{ i: "mealplan-1", widget: "mealplan", x: 0, y: 0, w: 6, h: 6, config: {} }],
      }),
    })
  ).json();
  await fetch(`${base}/api/views/${schedView.id}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ start: "00:00", end: "23:59" }),
  });
  await seedView(base, [{ i: "clock-1", widget: "clock", x: 0, y: 0, w: 4, h: 3, config: {} }]);
  const schedCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const schedPage = await schedCtx.newPage();
  await schedPage.goto(base);
  await schedPage.waitForSelector(".widget-card");
  await schedPage.waitForTimeout(500);
  step(
    "scheduled view takes over at rest",
    (await schedPage.locator(".meal-grid").count()) === 1,
  );
  // guest mode must never be escaped by a scheduled window firing
  await fetch(`${base}/api/views/1/guest`, { method: "POST" });
  const guestCtx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const guestPage2 = await guestCtx2.newPage();
  await guestPage2.addInitScript(() => localStorage.setItem("hearth-guest", "1"));
  await guestPage2.goto(base);
  await guestPage2.waitForSelector(".widget-card");
  await guestPage2.waitForTimeout(800);
  step(
    "active schedule cannot escape guest mode",
    (await guestPage2.locator(".meal-grid").count()) === 0 &&
      (await guestPage2.locator(".widget-card").count()) === 1,
  );
  await guestCtx2.close();
  await schedCtx.close();

  return failures();
}
