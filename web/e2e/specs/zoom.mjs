// Widget zoom: in view mode a double tap blows a widget up to a temporary
// fullscreen card; another double tap or the ✕ puts it back. Edit mode
// keeps double taps inert so gestures never fight the grid.
import { makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function zoom({ browser, base }) {
  const { step, failures } = makeStepper();
  const { page, errors } = await newPage(browser);

  await seedView(base, [
    { i: "clock-1", widget: "clock", x: 0, y: 0, w: 4, h: 3, config: {} },
    { i: "meds-1", widget: "meds", x: 4, y: 0, w: 4, h: 4, config: {} },
  ]);
  await page.goto(base);
  await page.waitForSelector(".widget-card");

  // --- double tap opens the fullscreen card ---
  await page.locator(".widget-card").first().dblclick();
  await page.waitForTimeout(200);
  step("double tap opens zoom", (await page.locator(".widget-zoom").count()) === 1);
  step(
    "zoom renders the widget content",
    (await page.locator(".widget-zoom .widget-content").count()) === 1,
  );

  // --- ✕ closes ---
  await page.locator('.widget-zoom [aria-label^="Close"]').click();
  await page.waitForTimeout(200);
  step("close button dismisses zoom", (await page.locator(".widget-zoom").count()) === 0);

  // --- double tap again toggles closed ---
  await page.locator(".widget-card").first().dblclick();
  await page.waitForTimeout(200);
  await page.locator(".widget-zoom").dblclick();
  await page.waitForTimeout(200);
  step("double tap on zoom closes it", (await page.locator(".widget-zoom").count()) === 0);

  // --- Escape closes ---
  await page.locator(".widget-card").first().dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  step("escape closes zoom", (await page.locator(".widget-zoom").count()) === 0);

  // --- single tap on the backdrop ring closes ---
  await page.locator(".widget-card").first().dblclick();
  await page.waitForTimeout(200);
  await page.locator(".widget-zoom").click({ position: { x: 8, y: 475 } });
  await page.waitForTimeout(200);
  step("backdrop tap closes zoom", (await page.locator(".widget-zoom").count()) === 0);

  // --- double tap works on interactive content too ---
  // Regression: the detector once ignored taps landing on buttons, so
  // widgets with clickable surfaces could never be zoomed.
  await page.locator('.widget-card [aria-label="Add medication"]').dblclick();
  await page.waitForTimeout(200);
  step(
    "double tap on a widget button still zooms",
    (await page.locator(".widget-zoom").count()) === 1,
  );
  await page.locator('.widget-zoom [aria-label^="Close"]').click();
  await page.waitForTimeout(200);

  // --- single tap never zooms ---
  await page.locator(".widget-card").first().click();
  await page.waitForTimeout(500);
  step("single tap does not zoom", (await page.locator(".widget-zoom").count()) === 0);

  // --- edit mode: double tap stays inert ---
  await page.locator('[aria-label="Edit layout"]').click();
  await page.waitForTimeout(300);
  await page.locator(".widget-card").first().dblclick();
  await page.waitForTimeout(200);
  step("edit mode never zooms", (await page.locator(".widget-zoom").count()) === 0);

  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
