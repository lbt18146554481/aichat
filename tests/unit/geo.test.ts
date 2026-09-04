import { describe, expect, it } from "vitest";
import {
  formatPlace,
  matchesLocationFilters,
  parsePlace,
  placeFromCityLabels,
  placeSatisfies,
} from "@/lib/geo";
import { normalizeCity, normalizeCityList } from "@/lib/match-normalize";
import { TEST_PEOPLE_POOL } from "../fixtures/people-pool";
import { recallCandidates } from "@/lib/match-recall";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";

describe("geo aliases", () => {
  it("maps 中国 and China to the same country", () => {
    expect(parsePlace("中国")).toEqual(parsePlace("China"));
    expect(parsePlace("china")?.country).toBe("cn");
    expect(parsePlace("中国")?.country).toBe("cn");
    expect(parsePlace("中国")?.city).toBeUndefined();
  });

  it("maps Berlin / 柏林 to the same city", () => {
    expect(parsePlace("Berlin")?.city).toBe("berlin");
    expect(parsePlace("柏林")?.city).toBe("berlin");
    expect(normalizeCity("Berlin")).toBe(normalizeCity("柏林"));
  });

  it("normalizeCityList stores country id for 中国", () => {
    expect(normalizeCityList(["中国", "China"])).toEqual(["cn"]);
  });
});

describe("geo hierarchy", () => {
  it("country filter matches people in that country's cities", () => {
    const beijing = placeFromCityLabels("Beijing", "北京");
    const berlin = placeFromCityLabels("Berlin", "柏林");
    const china = parsePlace("中国")!;
    const chinaEn = parsePlace("China")!;

    expect(placeSatisfies(beijing, china)).toBe(true);
    expect(placeSatisfies(beijing, chinaEn)).toBe(true);
    expect(placeSatisfies(berlin, china)).toBe(false);
  });

  it("Portugal filter includes Lisbon, not Berlin", () => {
    const lisbon = placeFromCityLabels("Lisbon", "里斯本");
    const berlin = placeFromCityLabels("Berlin", "柏林");
    const pt = parsePlace("葡萄牙")!;
    expect(placeSatisfies(lisbon, pt)).toBe(true);
    expect(placeSatisfies(berlin, pt)).toBe(false);
  });

  it("exclude country drops that country's cities", () => {
    const berlin = placeFromCityLabels("Berlin", "柏林");
    expect(
      matchesLocationFilters(berlin, [], [parsePlace("德国")!]),
    ).toBe(false);
    expect(
      matchesLocationFilters(berlin, [parsePlace("欧洲")!], [parsePlace("德国")!]),
    ).toBe(false);
  });

  it("formats country in zh/en", () => {
    expect(formatPlace(parsePlace("cn")!, "zh-CN")).toBe("中国");
    expect(formatPlace(parsePlace("中国")!, "en")).toBe("China");
  });
});

describe("recallCandidates location hierarchy", () => {
  it("Portugal / 葡萄牙 recalls Lisbon people, not Berlin", () => {
    const zh = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, cities: ["葡萄牙"] },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    const en = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, cities: ["Portugal"] },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    expect(zh.candidates.some((c) => c.id === "isa")).toBe(true);
    expect(zh.candidates.every((c) => c.id !== "theo")).toBe(true);
    expect(en.candidates.some((c) => c.id === "isa")).toBe(true);
  });

  it("China filter matches CN seed people, not Berlin", () => {
    const result = recallCandidates({
      understanding: { positive: [], negative: [], notes: [] },
      hardFilters: { ...EMPTY_HARD_FILTERS, cities: ["中国"] },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool: TEST_PEOPLE_POOL,
    });
    expect(result.candidates.every((c) => c.id !== "theo")).toBe(true);
    expect(result.candidates.some((c) => ["lin", "hao", "yue", "min"].includes(c.id))).toBe(
      true,
    );
  });
});
