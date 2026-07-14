import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

// Guest Wi-Fi card: fully frontend (the QR is generated in the browser from
// the instance's config, like countdown/agenda there is no backend half).
// Covers the unconfigured empty state, the QR + credentials rendering, and
// the settings flow persisting per-instance config.

export default async function wifi({ browser, base }) {
  const { step, failures } = makeStepper();

  // --- unconfigured instance points at settings ---
  await seedView(base, [{ i: "wifi-1", widget: "wifi", x: 0, y: 0, w: 3, h: 4, config: {} }]);
  const { page, errors } = await newPage(browser);
  await page.goto(base);
  await page.waitForSelector(".widget-card");
  step("unconfigured shows empty state", (await page.locator("text=Add your network").count()) === 1);

  // --- settings flow persists per-instance config ---
  await page.locator('[aria-label="Edit layout"]').click();
  await page.locator('[aria-label="Guest Wi-Fi settings"]').click();
  await page.locator('input[type="text"]').first().fill("HearthGuest");
  await page.getByLabel("Password").fill("cocoa123");
  await page.getByLabel("Hidden network").check();
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(600);
  const item = (await getLayout(base)).find((i) => i.widget === "wifi");
  step(
    "settings persist ssid, password, and hidden flag",
    item?.config?.ssid === "HearthGuest" &&
      item?.config?.auth === "WPA" &&
      item?.config?.password === "cocoa123" &&
      item?.config?.hidden === true,
  );

  // --- configured card renders the QR and readable credentials ---
  step("card shows the network name", (await page.locator("text=HearthGuest").count()) >= 1);
  step("card shows the password", (await page.locator("text=cocoa123").count()) === 1);
  step("card invites scanning", (await page.locator("text=Scan to join").count()) === 1);
  const qr = page.locator(".wifi-qr");
  step("QR renders with module data", (await qr.count()) === 1 && (await qr.locator("path").getAttribute("d")) !== "");
  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
