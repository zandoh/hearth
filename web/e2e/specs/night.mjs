import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function night({ browser, base }) {
  const { step, failures } = makeStepper();
  await seedView(base, [{ i: "clock-1", widget: "clock", x: 0, y: 0, w: 4, h: 3, config: {} }]);

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
  await nightCtx.close();
  return failures();
}
