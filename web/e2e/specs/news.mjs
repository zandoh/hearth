import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

// News widget: card rendering from headlines data (with SSE dead — rendering
// must not depend on the stream) and the settings flow persisting the
// per-instance topic. Google News is never contacted: the browser↔backend
// calls are stubbed with page.route.

const headlinesStub = {
  headlines: {
    topic: "top",
    fetchedAt: "2026-07-13T12:00:00Z",
    // Eight served; the instance's count=3 must slice to the first three.
    items: ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"].map((t, i) => ({
      title: `Headline ${t}`,
      source: `Source ${t}`,
      publishedAt: new Date(Date.now() - (i + 1) * 40 * 60000).toISOString(),
    })),
  },
};

export default async function news({ browser, base }) {
  const { step, failures } = makeStepper();

  // --- configured card renders from headline data with SSE dead ---
  await seedView(base, [
    { i: "news-1", widget: "news", x: 0, y: 0, w: 4, h: 6, config: { topic: "top", count: 3 } },
  ]);
  const { page, errors } = await newPage(browser);
  await page.route("**/api/stream", (r) => r.abort());
  await page.route("**/api/widgets/news/headlines*", (r) => r.fulfill({ json: headlinesStub }));
  await page.goto(base);
  await page.waitForSelector(".widget-card");
  await page.waitForTimeout(400);
  step("card shows the topic label", (await page.locator("text=TOP STORIES").count()) === 1);
  const shown = await Promise.all(
    ["Headline H1", "Headline H2", "Headline H3", "Headline H4"].map((t) =>
      page.locator(`text=${t}`).count(),
    ),
  );
  step(
    "headlines slice to the configured count",
    shown[0] === 1 && shown[1] === 1 && shown[2] === 1 && shown[3] === 0,
  );
  step("source and age render", (await page.locator("text=Source H1 · 40m").count()) === 1);

  // --- settings flow persists the per-instance topic ---
  await page.locator('[aria-label="Edit layout"]').click();
  await page.locator('[aria-label="News settings"]').click();
  await page.getByRole("combobox", { name: "Topic" }).click();
  await page.getByRole("option", { name: "Science" }).click();
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(600);
  const item = (await getLayout(base)).find((i) => i.widget === "news");
  step("settings persist the topic", item?.config?.topic === "science");
  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();
  return failures();
}
