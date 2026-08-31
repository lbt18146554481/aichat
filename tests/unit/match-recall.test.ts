import { describe, expect, it } from "vitest";
import { recallCandidates } from "@/lib/match-recall";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import { normalizeCity, normalizeEducationLevel } from "@/lib/match-normalize";

describe("match-normalize", () => {
  it("normalizes city aliases case-insensitively", () => {
    expect(normalizeCity("Berlin")).toBe(normalizeCity("berlin"));
    expect(normalizeCity("柏林")).toBe(normalizeCity("berlin"));
  });

  it("normalizes education levels", () => {
    expect(normalizeEducationLevel("硕士")).toBe("master");
    expect(normalizeEducationLevel("PhD")).toBe("doctorate");
  });
});

describe("recallCandidates", () => {
  it("hard-filters by age max", () => {
    const result = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, ageMax: 30 },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
    });
    expect(result.candidates.every((c) => c.id !== "leo")).toBe(true);
    expect(result.filteredCount).toBeGreaterThan(0);
  });

  it("hard-filters by education min", () => {
    const result = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, educationMin: "master" },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
    });
    for (const c of result.candidates) {
      expect(["isa", "june", "theo", "noa", "wren"].includes(c.id)).toBe(true);
    }
  });
});
