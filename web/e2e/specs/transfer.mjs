import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeStepper, newPage, seedView } from "../helpers.mjs";

// Layout transfer: export → import must round-trip a layout intact
// (dev board → home server is the use case), colliding names get a
// numeric suffix, and the Views dialog drives both ends.

export default async function transfer({ browser, base }) {
  const { step, failures } = makeStepper();

  const layout = [
    {
      i: "wifi-1",
      widget: "wifi",
      x: 0,
      y: 0,
      w: 3,
      h: 4,
      config: { ssid: "HearthGuest", auth: "WPA", password: "pw" },
    },
  ];
  await seedView(base, layout);

  // --- API round trip ---
  const exportRes = await fetch(`${base}/api/views/export`);
  const doc = await exportRes.json();
  step(
    "export serves a versioned attachment",
    doc.hearthViews === 1 &&
      Array.isArray(doc.views) &&
      (exportRes.headers.get("content-disposition") ?? "").includes("hearth-views-"),
  );

  const importRes = await fetch(`${base}/api/views/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  const { imported } = await importRes.json();
  step(
    "import appends with a deduped name",
    importRes.status === 201 && imported.length === 1 && imported[0].name === "Home 2",
  );
  step(
    "layout survives the round trip",
    imported[0].layout.length === 1 &&
      imported[0].layout[0].widget === "wifi" &&
      imported[0].layout[0].config.ssid === "HearthGuest",
  );

  // --- UI: export downloads a file, import ingests one ---
  const { page, errors } = await newPage(browser);
  await page.goto(base);
  await page.waitForSelector(".widget-card");
  await page.locator('[aria-label="Edit layout"]').click();
  await page.locator('[aria-label="Manage views"]').click();

  const downloadP = page.waitForEvent("download");
  await page.locator('button:has-text("Export views")').click();
  const download = await downloadP;
  step(
    "export button downloads a hearth-views file",
    download.suggestedFilename().startsWith("hearth-views-"),
    download.suggestedFilename(),
  );

  const file = join(tmpdir(), "hearth-transfer-e2e.json");
  writeFileSync(
    file,
    JSON.stringify({
      hearthViews: 1,
      exportedAt: new Date().toISOString(),
      views: [{ name: "From dev", layout }],
    }),
  );
  await page.locator('input[aria-label="Views export file"]').setInputFiles(file);
  await page.waitForTimeout(600);
  step("import reports its count", (await page.locator("text=Imported 1 view.").count()) === 1);
  const views = await (await fetch(`${base}/api/views`)).json();
  step(
    "imported view is on the board",
    views.some((v) => v.name === "From dev"),
    views.map((v) => v.name).join(", "),
  );
  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
