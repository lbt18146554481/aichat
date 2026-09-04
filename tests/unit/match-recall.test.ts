import { describe, expect, it } from "vitest";
import { recallCandidates, ensureMatchableHardFilters } from "@/lib/match-recall";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import {
  normalizeCity,
  normalizeEducationLevel,
  educationRank,
  normalizeGender,
  relaxHardFiltersFromMessage,
} from "@/lib/match-normalize";
import { TEST_PEOPLE_POOL } from "../fixtures/people-pool";

describe("match-normalize", () => {
  it("normalizes city aliases case-insensitively", () => {
    expect(normalizeCity("Berlin")).toBe(normalizeCity("berlin"));
    expect(normalizeCity("柏林")).toBe(normalizeCity("berlin"));
  });

  it("normalizes education levels", () => {
    expect(normalizeEducationLevel("硕士")).toBe("master");
    expect(normalizeEducationLevel("PhD")).toBe("doctorate");
  });

  it("normalizes gender aliases", () => {
    expect(normalizeGender("女生")).toBe("female");
    expect(normalizeGender("male")).toBe("male");
    expect(normalizeGender("非二元")).toBe("nonbinary");
  });

  it("relaxHardFiltersFromMessage keeps only female on 都放宽只要女生", () => {
    const relaxed = relaxHardFiltersFromMessage("都放宽吧，只要是女生就行", {
      ...EMPTY_HARD_FILTERS,
      genders: ["female"],
      cities: ["cn"],
      ageMax: 25,
    });
    expect(relaxed).toEqual({ ...EMPTY_HARD_FILTERS, genders: ["female"] });
  });
});

// Location hierarchy / CN↔EN aliases: see geo.test.ts

describe("recallCandidates", () => {
  it("hard-filters by age max", () => {
    const result = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, ageMax: 30 },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    expect(result.candidates.every((c) => c.id !== "leo")).toBe(true);
    expect(result.filteredCount).toBeGreaterThan(0);
  });

  it("hard-filters by gender", () => {
    const result = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, genders: ["male"] },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    expect(result.filteredCount).toBeGreaterThan(0);
    expect(
      result.candidates.every((c) =>
        ["theo", "hugo", "soren", "leo", "kai", "hao"].includes(c.id),
      ),
    ).toBe(true);
    expect(result.candidates.some((c) => c.id === "isa")).toBe(false);
  });

  it("hard-filters by education min", () => {
    const result = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, educationMin: "master" },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    const masterPlusIds = new Set(
      TEST_PEOPLE_POOL.filter(
        (p) => educationRank(p.educationLevel) >= educationRank("master"),
      ).map((p) => p.id),
    );
    for (const c of result.candidates) {
      expect(masterPlusIds.has(c.id)).toBe(true);
    }
  });

  it("ensureMatchableHardFilters drops blocking age/city when gender-only works", () => {
    const fixed = ensureMatchableHardFilters(
      {
        ...EMPTY_HARD_FILTERS,
        genders: ["female"],
        cities: ["beijing"],
        ageMax: 20,
      },
      TEST_PEOPLE_POOL,
      {
        understanding: { positive: [], negative: [], notes: [] },
        blockedIds: [],
        shownIds: [],
        passedIds: [],
      },
    );
    expect(fixed.genders).toEqual(["female"]);
    expect(fixed.cities).toEqual([]);
    expect(fixed.ageMax).toBeNull();
    const recall = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: fixed,
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    expect(recall.filteredCount).toBeGreaterThan(0);
  });

  it("ensureMatchable drops city before age when city zeroes pool", () => {
    const fixed = ensureMatchableHardFilters(
      {
        ...EMPTY_HARD_FILTERS,
        genders: ["female"],
        cities: ["beijing"],
        ageMin: 25,
        ageMax: 30,
      },
      TEST_PEOPLE_POOL,
      {
        understanding: { positive: [], negative: [], notes: [] },
        blockedIds: [],
        shownIds: [],
        passedIds: [],
      },
    );
    expect(fixed.cities).toEqual([]);
    expect(fixed.ageMin).toBe(25);
    expect(fixed.ageMax).toBe(30);
    expect(fixed.genders).toEqual(["female"]);
  });
});
