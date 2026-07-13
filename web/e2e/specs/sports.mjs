import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

// Sports widget: unconfigured empty state, card rendering from games data
// (with SSE dead — rendering must not depend on the stream), and the
// settings flow persisting per-instance config. ESPN is never contacted:
// the browser↔backend calls are stubbed with page.route.

const gamesStub = {
  games: {
    league: "nfl",
    team: { id: "2", name: "Buffalo Bills", abbrev: "BUF", record: "8-2" },
    fetchedAt: "2026-07-12T12:00:00Z",
    previous: {
      id: "prev",
      start: "2026-07-05T17:00:00Z",
      status: "final",
      home: false,
      opponent: { id: "15", name: "Miami Dolphins", abbrev: "MIA" },
      teamScore: 31,
      oppScore: 10,
      detail: "Final",
    },
    live: {
      id: "live",
      start: "2026-07-12T17:00:00Z",
      status: "live",
      home: true,
      opponent: { id: "20", name: "New York Jets", abbrev: "NYJ" },
      teamScore: 21,
      oppScore: 17,
      detail: "Q3 8:42",
    },
    // Five served; the instance's count=3 must slice to the first three.
    upcoming: ["U1", "U2", "U3", "U4", "U5"].map((abbrev, i) => ({
      id: `up-${abbrev}`,
      start: `2026-07-${19 + i}T17:00:00Z`,
      status: "scheduled",
      home: i % 2 === 0,
      opponent: { id: `10${i}`, name: `Team ${abbrev}`, abbrev },
    })),
  },
};

export default async function sports({ browser, base }) {
  const { step, failures } = makeStepper();

  // --- unconfigured instance points at settings ---
  await seedView(base, [
    { i: "sports-1", widget: "sports", x: 0, y: 0, w: 4, h: 5, config: {} },
  ]);
  const { page, errors } = await newPage(browser);
  await page.goto(base);
  await page.waitForSelector(".widget-card");
  step("unconfigured shows empty state", (await page.locator("text=Pick a team").count()) === 1);

  // --- settings flow persists per-instance config ---
  await page.route("**/api/widgets/sports/teams*", (r) =>
    r.fulfill({
      json: [
        { id: "2", name: "Buffalo Bills", abbrev: "BUF" },
        { id: "15", name: "Miami Dolphins", abbrev: "MIA" },
      ],
    }),
  );
  await page.route("**/api/widgets/sports/games*", (r) => r.fulfill({ json: { pending: true } }));
  await page.locator('[aria-label="Edit layout"]').click();
  await page.locator('[aria-label="Sports settings"]').click();
  await page.getByRole("combobox", { name: "League" }).click();
  await page.getByRole("option", { name: "NFL" }).click();
  await page.getByRole("combobox", { name: "Team" }).click();
  await page.getByRole("option", { name: "Buffalo Bills" }).click();
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(600);
  const item = (await getLayout(base)).find((i) => i.widget === "sports");
  step(
    "settings persist league, team, and denormalized name",
    item?.config?.league === "nfl" &&
      item?.config?.teamId === "2" &&
      item?.config?.teamName === "Buffalo Bills" &&
      item?.config?.abbrev === "BUF",
  );
  step("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
  await page.close();

  // --- configured card renders from games data with SSE dead ---
  await seedView(base, [
    {
      i: "sports-1",
      widget: "sports",
      x: 0,
      y: 0,
      w: 4,
      h: 6,
      config: { league: "nfl", teamId: "2", teamName: "Buffalo Bills", abbrev: "BUF", count: 3 },
    },
  ]);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const cardPage = await ctx.newPage();
  await cardPage.route("**/api/stream", (r) => r.abort());
  await cardPage.route("**/api/widgets/sports/games*", (r) => r.fulfill({ json: gamesStub }));
  await cardPage.goto(base);
  await cardPage.waitForSelector(".widget-card");
  await cardPage.waitForTimeout(400);
  step(
    "card shows team and record",
    (await cardPage.locator("text=Buffalo Bills").count()) === 1 &&
      (await cardPage.locator("text=8-2").count()) === 1,
  );
  step(
    "live block shows badge, score, and clock",
    (await cardPage.locator("text=LIVE").count()) === 1 &&
      (await cardPage.locator("text=BUF 21 – 17 NYJ").count()) === 1 &&
      (await cardPage.locator("text=Q3 8:42").count()) === 1,
  );
  step(
    "last game shows W and score",
    (await cardPage.locator("text=@ MIA").count()) === 1 &&
      (await cardPage.locator("text=31–10").count()) === 1,
  );
  // opponentLabel alternates "vs U1", "@ U2", … with the stub's home flags.
  const shown = await Promise.all(
    ["vs U1", "@ U2", "vs U3", "@ U4", "vs U5"].map((label) =>
      cardPage.locator(`text=${label}`).count(),
    ),
  );
  step(
    "upcoming slices to the configured count",
    shown[0] === 1 && shown[1] === 1 && shown[2] === 1 && shown[3] === 0 && shown[4] === 0,
  );
  await ctx.close();
  return failures();
}
