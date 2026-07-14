import { describe, expect, test } from "bun:test";
import { pollenLevel, pollenSummary } from "./pollen";

describe("pollenLevel", () => {
  test("bands differ per category (NAB scale)", () => {
    // 20 grains/m³ is high for grass, moderate for weed, only moderate for tree at 15+.
    expect(pollenLevel("grass", 20)).toBe("high");
    expect(pollenLevel("weed", 20)).toBe("moderate");
    expect(pollenLevel("tree", 20)).toBe("moderate");
  });

  test("band edges", () => {
    expect(pollenLevel("grass", 0)).toBe("low");
    expect(pollenLevel("grass", 4.9)).toBe("low");
    expect(pollenLevel("grass", 5)).toBe("moderate");
    expect(pollenLevel("grass", 200)).toBe("very high");
    expect(pollenLevel("tree", 1500)).toBe("very high");
    expect(pollenLevel("weed", 50)).toBe("high");
  });
});

describe("pollenSummary", () => {
  test("omits categories with no data", () => {
    expect(pollenSummary({ tree: 100, grass: null, weed: 3 })).toBe("Tree high · Weed low");
  });

  test("zero is a low reading, not missing data", () => {
    expect(pollenSummary({ tree: null, grass: 0, weed: null })).toBe("Grass low");
  });

  test("empty outside pollen coverage", () => {
    expect(pollenSummary(null)).toBe("");
    expect(pollenSummary({ tree: null, grass: null, weed: null })).toBe("");
  });
});
