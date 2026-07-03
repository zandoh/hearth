import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function calendar({ browser, base }) {
  const { step, failures } = makeStepper();
  const { page, errors } = await newPage(browser);

  await seedView(base, [
    { i: "calendar-1", widget: "calendar", x: 0, y: 0, w: 8, h: 6, config: {} },
  ]);
  await page.goto(base);
  await page.waitForSelector(".widget-card");

  // --- calendar view modes ---
  await page.getByLabel("Calendar view").click();
  await page.waitForTimeout(200);
  await page.getByText("Work week", { exact: true }).last().click();
  await page.waitForTimeout(500);
  step("work week renders 5 columns", (await page.locator(".cal-tg-col").count()) === 5);
  const layout = await getLayout(base);
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
  return failures();
}
