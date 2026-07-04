// Re-render the GitHub social preview (docs/social-preview.png) from
// social-card.html: the brand lockup and tagline beside the current
// board-dark.png hero. Re-run after re-shooting the heroes, then upload
// in GitHub -> Settings -> Social preview (there is no API for it).
//
//   bun e2e/social.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
// 1280x640 is GitHub's recommended canvas; deviceScaleFactor 2 renders
// crisp at 2560x1280 (GitHub accepts anything >= 640x320).
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
await page.goto("file://" + join(here, "social-card.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const out = join(here, "..", "..", "docs", "social-preview.png");
await page.screenshot({ path: out });
await browser.close();
console.log("wrote " + out);
