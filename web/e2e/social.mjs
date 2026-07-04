// Renders both share images from social-card.html:
//   docs/social-preview.png  1280x640 @2x — GitHub's social preview spec
//   web/public/og.png        1200x630 @2x — 1.91:1 for og:image unfurls,
//                            with a call-to-action (validators flag both
//                            the 2:1 ratio and CTA-less images)
// Re-run after re-shooting the heroes; GitHub's image needs a manual
// re-upload in Settings, og.png deploys with the demo automatically.
//
//   bun e2e/social.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();

async function shoot(width, height, bodyClass, out, opts = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto("file://" + join(here, "social-card.html"));
  if (bodyClass) await page.evaluate((c) => document.body.classList.add(c), bodyClass);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, ...opts });
  await page.close();
  console.log("wrote " + out);
}

await shoot(1280, 640, null, join(here, "..", "..", "docs", "social-preview.png"));
// scale: "css" renders at DPR 2 but emits exactly 1200x630 — validators
// want the canonical size, and the downscale keeps text crisp.
await shoot(1200, 630, "og", join(here, "..", "public", "og.png"), { scale: "css" });
await browser.close();
