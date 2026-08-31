import { describe, expect, it } from "vitest";
import { publishMyIntent, seedPool } from "@/lib/intents";
import { recallWishCandidates, WISH_RECALL_LIMIT } from "@/lib/wish-recall";
import { EMPTY_WISH_HARD_FILTERS } from "@/lib/wish-types";

describe("wish-recall", () => {
  it("returns at most Top K candidates", () => {
    const mine = publishMyIntent({
      kind: "tennis",
      when: "weekend",
      level: "intermediate",
      rawText: "weekend tennis",
      city: "Berlin",
      city_zh: "柏林",
    });
    const result = recallWishCandidates({
      mine,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      understanding: { positive: [], negative: [], notes: [] },
    });
    expect(result.candidates.length).toBeLessThanOrEqual(WISH_RECALL_LIMIT);
  });

  it("prefers same-city before cross-city", () => {
    const mine = publishMyIntent({
      kind: "run",
      when: "weekend",
      rawText: "weekend run",
      city: "Berlin",
      city_zh: "柏林",
    });
    const result = recallWishCandidates({
      mine,
      hardFilters: { cities: ["berlin"], excludeCities: [], kinds: ["run"] },
      understanding: { positive: [], negative: [], notes: [] },
    });
    if (result.candidates.length > 0) {
      expect(result.crossCityUsed).toBe(false);
    }
  });

  it("seed pool has ~40 entries", () => {
    expect(seedPool().length).toBeGreaterThanOrEqual(38);
  });
});
