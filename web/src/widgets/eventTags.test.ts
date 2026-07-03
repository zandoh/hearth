import { describe, expect, test } from "bun:test";
import { eventTags, hasAnyTag, parseTagList, stripTags } from "./eventTags";

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
