import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function guest({ browser, base }) {
  const { step, failures } = makeStepper();
  await seedView(base, [{ i: "clock-1", widget: "clock", x: 0, y: 0, w: 4, h: 3, config: {} }]);

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
