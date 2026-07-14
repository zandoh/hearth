// E2E runner: boots a fresh hearth binary (fresh database) per spec file,
// drives it with headless Chromium, and exits non-zero on any failure.
// Run via `make e2e` (or `bun e2e/run.mjs` after `make build`).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import boardSpec from "./specs/board.mjs";
import calendarSpec from "./specs/calendar.mjs";
import guestSpec from "./specs/guest.mjs";
import guestbookSpec from "./specs/guestbook.mjs";
import newsSpec from "./specs/news.mjs";
import nightSpec from "./specs/night.mjs";
import onboardingSpec from "./specs/onboarding.mjs";
import sportsSpec from "./specs/sports.mjs";
import viewsSpec from "./specs/views.mjs";
import widgetsSpec from "./specs/widgets.mjs";
import wifiSpec from "./specs/wifi.mjs";
import wordSpec from "./specs/word.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BIN = process.env.HEARTH_BIN ?? join(here, "..", "..", "bin", "hearth");
const PORT = Number(process.env.HEARTH_E2E_PORT ?? 8199);
const BASE = `http://localhost:${PORT}`;

async function waitForHealthy() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/api/healthz`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not become healthy");
}

// One spec per concern; the runner's fresh binary + throwaway DB per
// entry IS the isolation — no spec depends on another's leftovers.
const specs = [
  ["onboarding", onboardingSpec],
  ["board", boardSpec],
  ["views", viewsSpec],
  ["calendar", calendarSpec],
  ["widgets", widgetsSpec],
  ["sports", sportsSpec],
  ["news", newsSpec],
  ["word", wordSpec],
  ["wifi", wifiSpec],
  ["guestbook", guestbookSpec],
  ["night", nightSpec],
  ["guest", guestSpec],
];

let totalFailures = 0;
const browser = await chromium.launch();

for (const [name, spec] of specs) {
  const dir = mkdtempSync(join(tmpdir(), "hearth-e2e-"));
  const server = spawn(BIN, ["-addr", `:${PORT}`, "-db", join(dir, "e2e.db")], {
    stdio: "ignore",
  });
  try {
    await waitForHealthy();
    console.log(`\n=== ${name} ===`);
    const failures = await spec({ browser, base: BASE });
    totalFailures += failures;
  } catch (err) {
    console.error(`${name}: crashed:`, err.message);
    totalFailures += 1;
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}

await browser.close();
console.log(totalFailures === 0 ? "\nall e2e specs passed" : `\n${totalFailures} FAILURE(S)`);
process.exit(totalFailures === 0 ? 0 : 1);
