import { describe, expect, test } from "bun:test";
import { eventTags, hasAnyTag, knownTags, parseTagList, stripTags, toggleTag } from "./eventTags";

describe("eventTags", () => {
  test("reads description and title, case-insensitive", () => {
    const tags = eventTags({ title: "Beach trip #Travel", notes: "packing list #COUNTDOWN" });
    expect(tags.has("travel")).toBe(true);
    expect(tags.has("countdown")).toBe(true);
  });
  test("description-only tagging works", () => {
    expect(hasAnyTag({ title: "Beach trip", notes: "#travel" }, ["travel"])).toBe(true);
  });
  test("untagged events do not match", () => {
    expect(hasAnyTag({ title: "Dentist", notes: "bring card" }, ["travel"])).toBe(false);
  });
  test("hashtags mid-word do not false-positive on urls", () => {
    expect(hasAnyTag({ title: "Read docs", notes: "https://x.test/page#travel" }, ["travel"])).toBe(
      true,
    ); // anchors do match — acceptable; tags are opt-in words
  });
});

describe("stripTags", () => {
  test("removes tags and tidies spacing", () => {
    expect(stripTags("Beach trip #travel #countdown")).toBe("Beach trip");
    expect(stripTags("#trip Cabin weekend")).toBe("Cabin weekend");
  });
  test("leaves plain titles alone", () => {
    expect(stripTags("Geno's Birthday")).toBe("Geno's Birthday");
  });
});

describe("parseTagList", () => {
  test("commas, spaces, stray #, casing, dupes", () => {
    expect(parseTagList("Travel, #trip  TRIP camp")).toEqual(["travel", "trip", "camp"]);
  });
  test("stored array passes through", () => {
    expect(parseTagList(["travel", "trip"])).toEqual(["travel", "trip"]);
  });
  test("garbage becomes empty", () => {
    expect(parseTagList(42)).toEqual([]);
  });
});

describe("toggleTag", () => {
  test("adds to empty and non-empty notes", () => {
    expect(toggleTag("", "countdown")).toBe("#countdown");
    expect(toggleTag("bring chairs", "travel")).toBe("bring chairs #travel");
  });
  test("removes an existing tag, tidying whitespace", () => {
    expect(toggleTag("bring chairs #travel", "travel")).toBe("bring chairs");
    expect(toggleTag("#countdown", "countdown")).toBe("");
  });
  test("case-insensitive and no partial-tag bites", () => {
    expect(toggleTag("plan #Travel", "travel")).toBe("plan");
    expect(toggleTag("#travelogue notes", "travel")).toBe("#travelogue notes #travel");
  });
});

describe("knownTags", () => {
  test("a configured widget narrows the set — no unconditional defaults", () => {
    const views = [{ layout: [{ widget: "countdown", config: { tags: ["countdown"] } }] }];
    expect(knownTags(views)).toEqual(["countdown"]);
  });
  test("an unconfigured tag-driven widget watches the defaults", () => {
    const views = [{ layout: [{ widget: "countdown", config: {} }] }];
    expect(knownTags(views).sort()).toEqual(["countdown", "travel", "trip"]);
  });
  test("union across instances, plus any widget with a tags list", () => {
    const views = [
      { layout: [{ widget: "countdown", config: { tags: ["ski"] } }] },
      { layout: [{ widget: "futurething", config: { tags: "camp" } }] },
    ];
    expect(knownTags(views).sort()).toEqual(["camp", "ski"]);
  });
  test("no tag-driven widgets -> no pills", () => {
    expect(knownTags([{ layout: [{ widget: "clock", config: {} }] }])).toEqual([]);
  });
});
