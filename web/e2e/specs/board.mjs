// Board mechanics: the hard-won grid behaviors. Every one of these caught a
// real bug during development — do not trim without reading the git history.
import { dragBy, getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function board({ browser, base }) {
  const { step, failures } = makeStepper();
  const { page, errors } = await newPage(browser);

  await seedView(base, [
    { i: "clock-1", widget: "clock", x: 5, y: 0, w: 4, h: 3, config: {} },
    { i: "meds-1", widget: "meds", x: 0, y: 3, w: 4, h: 4, config: {} },
  ]);
  await page.goto(base);
  await page.waitForSelector(".widget-card");

  // --- view mode: everything inert ---
  step("view mode has no chrome bars", (await page.locator(".widget-chrome").count()) === 0);
  step(
    "view mode has no active resize handles",
    (await page.locator(".react-resizable-handle:visible").count()) === 0,
  );

  // --- edit mode: drag by chrome, both axes, size preserved ---
  await page.locator('[aria-label="Edit layout"]').click();
  await page.waitForTimeout(300);
  const clock = page.locator(".react-grid-item").first();
  await dragBy(page, clock.locator(".widget-chrome"), -240, 120);
  let l = await getLayout(base);
  let c = l.find((i) => i.i === "clock-1");
  step("drag moves on both axes", c.x !== 5 && c.y !== 0, `(5,0) -> (${c.x},${c.y})`);
  step("drag preserves size", c.w === 4 && c.h === 3, `${c.w}x${c.h}`);

  // --- push is minimal and cascades resolve (snapshot compactor) ---
  await seedView(base, [
    { i: "clock-1", widget: "clock", x: 5, y: 0, w: 4, h: 3, config: {} },
    { i: "meds-1", widget: "meds", x: 0, y: 3, w: 4, h: 4, config: {} },
  ]);
  await page.reload();
  await page.waitForSelector(".widget-card");
  await page.locator('[aria-label="Edit layout"]').click();
  await page.waitForTimeout(300);
  // drop the clock directly onto meds, wandering on the way
  const chrome = page.locator(".react-grid-item").first().locator(".widget-chrome");
  const cb = await chrome.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x - 200, cb.y + 150, { steps: 8 });
  await page.mouse.move(cb.x - 450, cb.y + 260, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  l = await getLayout(base);
  c = l.find((i) => i.i === "clock-1");
  const m = l.find((i) => i.i === "meds-1");
  const overlap =
    c.x < m.x + m.w && m.x < c.x + c.w && c.y < m.y + m.h && m.y < c.y + c.h;
  step("no overlap after push", !overlap, `clock(${c.x},${c.y}) meds(${m.x},${m.y})`);
  step(
    "push is minimal (no accumulation)",
    m.y <= c.y + c.h,
    `meds y=${m.y}, intruder bottom=${c.y + c.h}`,
  );

  // --- resize via east edge strip; min clamp 2x2 ---
  const clockNow = page.locator(".react-grid-item").first();
  let box = await clockNow.boundingBox();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  l = await getLayout(base);
  c = l.find((i) => i.i === "clock-1");
  step("resize clamps at min width 2", c.w === 2, `w=${c.w}`);

  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
