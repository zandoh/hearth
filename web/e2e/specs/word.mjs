import { makeStepper, newPage, seedView } from "../helpers.mjs";

// Word of the day: fully offline (the pack is embedded in the binary), so
// this spec runs against the real endpoint — no stubs. It checks the card
// renders the same word the API serves, complete with its definition.

export default async function word({ browser, base }) {
  const { step, failures } = makeStepper();

  const today = await (await fetch(`${base}/api/widgets/word/today`)).json();
  step(
    "API serves a complete word",
    Boolean(today.word && today.pos && today.definition && today.example),
    JSON.stringify(today),
  );

  await seedView(base, [{ i: "word-1", widget: "word", x: 0, y: 0, w: 4, h: 5, config: {} }]);
  const { page, errors } = await newPage(browser);
  await page.goto(base);
  await page.waitForSelector(".widget-card");
  await page.waitForTimeout(400);

  step("card shows the label", (await page.locator("text=WORD OF THE DAY").count()) === 1);
  step("card shows today's word", (await page.locator(`text=${today.word}`).count()) >= 1);
  step(
    "card shows the definition and example",
    (await page.locator(`text=${today.definition}`).count()) === 1 &&
      (await page.locator(`text=${today.example}`).count()) === 1,
  );
  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
