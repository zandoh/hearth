// Shared helpers for e2e specs.

export function makeStepper() {
  let failures = 0;
  const step = (name, ok, detail) => {
    if (!ok) failures += 1;
    console.log(`${name}: ${ok ? "PASS" : "FAIL"} ${detail ?? ""}`);
  };
  return { step, failures: () => failures };
}

export async function seedView(base, layout) {
  const res = await fetch(`${base}/api/views/1`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Home", layout }),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status}`);
}

export const getLayout = async (base) =>
  (await (await fetch(`${base}/api/views`)).json())[0].layout;

export async function newPage(browser, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, ...opts });
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, errors };
}

/** Drag from a locator's center by (dx, dy). */
export async function dragBy(page, locator, dx, dy) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}
