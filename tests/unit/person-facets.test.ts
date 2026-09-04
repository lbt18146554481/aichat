import { describe, expect, it } from "vitest";
import { TEST_PEOPLE_POOL } from "../fixtures/people-pool";
import { facetsFromSignals, resolveFacetId } from "@/lib/person-facets";
import { semanticSimilarity } from "@/lib/text-similarity";
import { recallCandidates } from "@/lib/match-recall";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";

describe("person facets", () => {
  it("maps legacy signals to interests and traits", () => {
    const { interests, traits } = facetsFromSignals(["reading", "quiet", "funny"]);
    expect(interests).toContain("reading");
    expect(traits).toContain("quiet");
    expect(traits).toContain("funny");
  });

  it("resolves 恬静 and 安静 to quiet trait", () => {
    expect(resolveFacetId("恬静")?.id).toBe("quiet");
    expect(resolveFacetId("安静")?.id).toBe("quiet");
    expect(resolveFacetId("quiet")?.id).toBe("quiet");
  });

  it("enriches seed people with profileText", () => {
    const isa = TEST_PEOPLE_POOL.find((p) => p.id === "isa");
    expect(isa?.gender).toBe("female");
    expect(isa?.interests).toContain("reading");
    expect(isa?.traits).toContain("quiet");
    expect(isa?.profileText.length).toBeGreaterThan(20);
    expect(isa?.status).toBe("active");
  });
});

describe("semantic similarity", () => {
  it("treats 安静 and 恬静 as similar preference vs profile", () => {
    const quietPerson =
      "安静 内敛 爱读书 翻译 里斯本 Translator in Lisbon. Reads in three languages.";
    const sim1 = semanticSimilarity("想找安静的人", quietPerson);
    const sim2 = semanticSimilarity("想找恬静的人", quietPerson);
    expect(sim1).toBeGreaterThan(0.15);
    expect(sim2).toBeGreaterThan(0.15);
    expect(Math.abs(sim1 - sim2)).toBeLessThan(0.15);
  });

  it("ranks quiet people above loud/outgoing when preference is 安静", () => {
    const quiet = TEST_PEOPLE_POOL.find((p) => p.traits.includes("quiet"))!;
    const playful = TEST_PEOPLE_POOL.find((p) => p.traits.includes("playful"));
    const q = semanticSimilarity("安静 慢热", quiet.profileText);
    if (playful) {
      const p = semanticSimilarity("安静 慢热", playful.profileText);
      expect(q).toBeGreaterThan(p);
    } else {
      expect(q).toBeGreaterThan(0);
    }
  });
});

describe("recallCandidates semantic ranking", () => {
  it("prefers quiet profiles when user notes mention 恬静", () => {
    const result = recallCandidates({
      understanding: {
        positive: [],
        negative: [],
        notes: ["想找恬静、爱读书的人"],
      },
      hardFilters: EMPTY_HARD_FILTERS,
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      limit: 5,
      pool: TEST_PEOPLE_POOL,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    const ids = result.candidates.map((c) => c.id);
    expect(ids).toContain("isa");
    const isa = result.candidates.find((c) => c.id === "isa");
    expect(isa?.vectorScore).toBeGreaterThan(0);
  });
});
