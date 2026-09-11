import { describe, expect, it } from "vitest";
import {
  EMBED_MIX_WEIGHT,
  LEXICAL_MIX_WEIGHT,
  mixEmbeddingLexical,
} from "@/lib/similarity-mix";
import { recallCandidates, RECALL_SOFT_WEIGHTS } from "@/lib/match-recall";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import { EMPTY_UNDERSTANDING } from "@/lib/understanding";
import { TEST_PEOPLE_POOL } from "../fixtures/people-pool";

describe("mixEmbeddingLexical", () => {
  it("returns lexical when embed is null", () => {
    expect(mixEmbeddingLexical(null, 0.4)).toBe(0.4);
  });

  it("mixes embed and lexical with configured weights", () => {
    const embed = 1;
    const lexical = 0;
    expect(mixEmbeddingLexical(embed, lexical)).toBeCloseTo(EMBED_MIX_WEIGHT, 5);
    expect(EMBED_MIX_WEIGHT + LEXICAL_MIX_WEIGHT).toBeCloseTo(1, 5);
    expect(mixEmbeddingLexical(0.8, 0.4)).toBeCloseTo(
      EMBED_MIX_WEIGHT * 0.8 + LEXICAL_MIX_WEIGHT * 0.4,
      5,
    );
  });
});

describe("recall soft weights — chat vs cold", () => {
  it("exposes chat query weight above culture affinity", () => {
    expect(RECALL_SOFT_WEIGHTS.chatQuery).toBeGreaterThan(RECALL_SOFT_WEIGHTS.culture);
    expect(RECALL_SOFT_WEIGHTS.coldFlexScale).toBeLessThan(1);
  });

  it("ranks warm/playful above quiet when chat asks for 热情", () => {
    const chatUnderstanding = {
      ...EMPTY_UNDERSTANDING,
      traits: ["warm", "playful"],
      notes: ["热情的女孩"],
    };
    const result = recallCandidates({
      understanding: chatUnderstanding,
      hardFilters: { ...EMPTY_HARD_FILTERS, genders: ["female"] },
      chatUnderstanding,
      chatHardFilters: { ...EMPTY_HARD_FILTERS, genders: ["female"] },
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      limit: 8,
      pool: TEST_PEOPLE_POOL,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    const top = result.candidates.slice(0, 3).map((c) => c.id);
    const byId = new Map(TEST_PEOPLE_POOL.map((p) => [p.id, p]));
    const topHasWarm = top.some((id) => {
      const p = byId.get(id);
      return p?.traits.includes("warm") || p?.traits.includes("playful");
    });
    const miraIdx = result.candidates.findIndex((c) => c.id === "mira");
    const warmIdx = result.candidates.findIndex((c) => {
      const p = byId.get(c.id);
      return p?.traits.includes("warm") || p?.traits.includes("playful");
    });
    expect(topHasWarm || (warmIdx >= 0 && (miraIdx < 0 || warmIdx < miraIdx))).toBe(true);
  });
});
