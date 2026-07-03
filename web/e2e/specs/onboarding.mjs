// First-boot onboarding: a pristine install offers starter templates once,
// applies the chosen layout to the Home view, and never asks again.
import { makeStepper, newPage } from "../helpers.mjs";

export default async function onboarding({ browser, base }) {
  const { step, failures } = makeStepper();
  const { page, errors } = await newPage(browser);

  // Deliberately no seeding: this spec runs against the pristine database.
  await page.goto(base);
  await page.waitForSelector("text=Welcome to hearth", { timeout: 5000 });
  step("template picker appears on a pristine install", true);

  await page.locator('li:has-text("Family hub") button').click();
  await page.waitForTimeout(1000);
  step(
    "picker closes and the template lands",
    (await page.locator("text=Welcome to hearth").count()) === 0 &&
      (await page.locator(".widget-card").count()) === 8,
  );

  await page.reload();
  await page.waitForSelector(".widget-card");
  await page.waitForTimeout(600);
  step("answer is remembered across reloads", (await page.locator("text=Welcome to hearth").count()) === 0);

  const check = await (await fetch(`${base}/api/onboarding`)).json();
  step("server reports onboarding done", check.needed === false);

  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
