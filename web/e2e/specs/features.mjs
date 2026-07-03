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

  // --- events are editable from the day dialog ---
  const localCal = await (
    await fetch(`${base}/api/widgets/calendar/calendars`, {
      method: "POST",
      body: JSON.stringify({ name: "Local", color: "#4f6df5" }),
    })
  ).json();
  const t = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayYmd = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  await fetch(`${base}/api/widgets/calendar/events`, {
    method: "POST",
    body: JSON.stringify({ calendarId: localCal.id, title: "Editable", allDay: true, startsAt: todayYmd }),
  });
  await page.getByLabel("Calendar view").click();
  await page.getByText("Month", { exact: true }).last().click();
  await page.waitForTimeout(500);
  await page.locator('.cal-day:has-text("Editable")').first().click();
  await page.locator('[aria-label="Edit Editable"]').click();
  step("edit form prefilled", (await page.getByLabel("Title").inputValue()) === "Editable");
  await page.getByLabel("Title").fill("Edited");
  await page.getByLabel("Notes").fill("#countdown");
  await page.locator('button:has-text("Save changes")').click();
  await page.waitForTimeout(600);
  const evs = await (
    await fetch(`${base}/api/widgets/calendar/events?start=2020-01-01T00:00:00Z&end=2030-01-01T00:00:00Z`)
  ).json();
  step(
    "event edit persists title and notes without duplicating",
    evs.length === 1 && evs[0].title === "Edited" && evs[0].notes === "#countdown",
    JSON.stringify(evs.map((e) => e.title)),
  );
  await page.locator('button:has-text("Close")').last().click();

  // --- editing a multi-day event must not shrink its span ---
  // Regression: the edit form used to omit endsAt, so touching a week-long
  // all-day event's description truncated it to a single day.
  const spanEnd = new Date(t);
  spanEnd.setDate(spanEnd.getDate() + 4);
  const spanEndYmd = `${spanEnd.getFullYear()}-${pad(spanEnd.getMonth() + 1)}-${pad(spanEnd.getDate())}`;
  await fetch(`${base}/api/widgets/calendar/events`, {
    method: "POST",
    body: JSON.stringify({
      calendarId: localCal.id,
      title: "Spanning",
      allDay: true,
      startsAt: todayYmd,
      endsAt: spanEndYmd,
    }),
  });
  await page.waitForTimeout(500);
  await page.locator('.cal-day:has-text("Spanning")').first().click();
  await page.locator('[aria-label="Edit Spanning"]').click();
  await page.getByLabel("Notes").fill("#trip");
  await page.locator('button:has-text("Save changes")').click();
  await page.waitForTimeout(600);
  const spanEv = (
    await (
      await fetch(`${base}/api/widgets/calendar/events?start=2020-01-01T00:00:00Z&end=2030-01-01T00:00:00Z`)
    ).json()
  ).find((e) => e.title === "Spanning");
  step(
    "multi-day span survives an edit",
    spanEv?.startsAt === todayYmd && spanEv?.endsAt === spanEndYmd,
    `${spanEv?.startsAt} -> ${spanEv?.endsAt}`,
  );
  await page.locator('button:has-text("Close")').last().click();

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

  // --- guest book corkboard: notes drag freely and persist ---
  await seedView(base, [
    { i: "gb-1", widget: "guestbook", x: 0, y: 0, w: 6, h: 6, config: {} },
  ]);
  await fetch(`${base}/api/widgets/guestbook`, {
    method: "POST",
    body: JSON.stringify({ author: "e2e", message: "Sticky", color: "yellow" }),
  });
  const nbCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const nbPage = await nbCtx.newPage();
  await nbPage.goto(base);
  await nbPage.waitForSelector(".sticky-note");
  const ink = await nbPage.evaluate(
    () => getComputedStyle(document.querySelector(".sticky-message")).color,
  );
  step("note ink is dark on paper", ink === "rgb(27, 25, 22)", ink);
  const noteBox = await nbPage.locator(".sticky-note").boundingBox();
  await nbPage.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await nbPage.mouse.down();
  await nbPage.mouse.move(noteBox.x + 250, noteBox.y + 120, { steps: 10 });
  await nbPage.mouse.up();
  await nbPage.waitForTimeout(600);
  const movedBox = await nbPage.locator(".sticky-note").boundingBox();
  step("note drags freely (no grid)", movedBox.x > noteBox.x + 120, `x ${Math.round(noteBox.x)} -> ${Math.round(movedBox.x)}`);
  const gbNotes = await (await fetch(`${base}/api/widgets/guestbook`)).json();
  step("note position persisted", gbNotes[0].x > 0 && gbNotes[0].y > 0, `x=${gbNotes[0].x?.toFixed(2)} y=${gbNotes[0].y?.toFixed(2)}`);
  await nbCtx.close();

  // --- widget mutations must not depend on SSE for their own feedback ---
  // Regression: adds/toggles used to rely solely on the SSE topic to refresh,
  // so with a dead stream the data saved but the screen never showed it.
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

  // --- night dimming: shade during quiet hours, tap-to-wake, re-dim ---
  await fetch(`${base}/api/night`, {
    method: "PUT",
    body: JSON.stringify({ enabled: true, start: "00:00", end: "23:59", level: 0.6 }),
  });
  const nightCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const nightPage = await nightCtx.newPage();
  await nightPage.goto(`${base}/?nightWakeMs=1200`);
  await nightPage.waitForSelector(".widget-card");
  await nightPage.waitForTimeout(400);
  step("night shade active in quiet window", (await nightPage.locator(".night-shade.on").count()) === 1);
  await nightPage.locator(".night-shade").click();
  await nightPage.waitForTimeout(300);
  step("tap wakes the board", (await nightPage.locator(".night-shade.on").count()) === 0);
  await nightPage.waitForTimeout(2000);
  step("shade returns after wake grace", (await nightPage.locator(".night-shade.on").count()) === 1);
  await fetch(`${base}/api/night`, {
    method: "PUT",
    body: JSON.stringify({ enabled: false, start: "00:00", end: "23:59", level: 0.6 }),
  });
  await nightCtx.close();

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
  await fetch(`${base}/api/views/${schedView.id}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ start: "", end: "" }),
  });
  await fetch(`${base}/api/views/0/guest`, { method: "POST" });
  await schedCtx.close();

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

  // --- guest mode round-trip must not disturb the board ---
  // Regression: the no-guest-view screensaver used to unmount the grid, which
  // zeroed react-grid-layout's container width for good — after the PIN exit
  // every widget rendered collapsed into the left edge.
  await fetch(`${base}/api/guest/pin`, { method: "POST", body: JSON.stringify({ pin: "4242" }) });
  const guestCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const gPage = await guestCtx.newPage();
  const boardShape = () =>
    gPage.evaluate(() =>
      [...document.querySelectorAll(".react-grid-item:not(.react-grid-placeholder)")].map(
        (el) => `${el.style.transform}|${el.style.width}`,
      ),
    );
  await gPage.goto(base);
  await gPage.waitForSelector(".widget-card");
  await gPage.waitForTimeout(400);
  const shapeBefore = await boardShape();
  await gPage.locator('[aria-label="Enter guest mode"]').click();
  await gPage.waitForTimeout(200);
  await gPage.locator('button:has-text("Enter guest mode")').last().click();
  await gPage.waitForSelector(".screensaver");
  step("guest without guest view shows screensaver", true);
  await gPage.locator(".screensaver").click();
  await gPage.waitForSelector(".screensaver-exit");
  await gPage.locator(".screensaver-exit").click();
  await gPage.getByLabel("Guest PIN").fill("4242");
  await gPage.locator('button:has-text("Unlock")').click();
  await gPage.waitForSelector(".widget-card", { timeout: 5000 });
  await gPage.waitForTimeout(600);
  const shapeAfter = await boardShape();
  step(
    "board layout survives guest round-trip",
    JSON.stringify(shapeBefore) === JSON.stringify(shapeAfter),
    `before=${shapeBefore[0]} after=${shapeAfter[0]}`,
  );
  await guestCtx.close();

  return failures();
}
