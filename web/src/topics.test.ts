import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOPICS } from "./topics";

// The SSE topic contract is a hand-maintained Go↔TS mirror. Drift is
// silent — a lagging frontend topic just never re-fetches — so this test
// makes the documented convention an enforced one: parse the Go constants
// and assert set equality with TOPICS.
describe("topics contract", () => {
  test("web/src/topics.ts mirrors internal/topics/topics.go exactly", () => {
    const goSource = readFileSync(
      join(import.meta.dir, "..", "..", "internal", "topics", "topics.go"),
      "utf8",
    );
    const goTopics = [...goSource.matchAll(/^\t\w+\s*=\s*"([a-z0-9-]+)"$/gm)]
      .map((m) => m[1])
      .sort();
    const tsTopics = (Object.values(TOPICS) as string[]).sort();

    expect(goTopics.length).toBeGreaterThan(0);
    expect(tsTopics).toEqual(goTopics);
  });

  test("keys equal values — topics are their own names", () => {
    for (const [key, value] of Object.entries(TOPICS)) {
      expect(key).toBe(value);
    }
  });
});
