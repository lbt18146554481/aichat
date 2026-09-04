import { describe, expect, it } from "vitest";
import { publishMyIntent } from "@/lib/intents";
import { EMPTY_BUDDY_HARD_FILTERS } from "@/lib/buddy-filters";
import {
  enumSoftMatchScore,
  scoreWishCandidate,
  vectorMatchScore,
  WISH_SCORE_WEIGHTS,
} from "@/lib/wish-match-score";

const EMPTY_U = { positive: [], negative: [], notes: [] };

describe("wish-match-score", () => {
  it("splits enum soft vs vector and weights total", () => {
    const mine = publishMyIntent({
      kind: "run",
      activityCore: "跑步",
      activityStrength: "flex",
      when: "weekend",
      rawText: "周末朝阳公园轻松慢跑，希望搭子话不多",
      city: "Beijing",
      city_zh: "北京",
      placeStrength: "flex",
      whenStrength: "flex",
      buddyPrefRaw: "话不多安静",
      otherReqRaw: "不要太卷",
      skipRemotePersist: true,
    });
    mine.buddyGenderStrength = "flex";
    const other = publishMyIntent({
      kind: "run",
      activityCore: "跑步",
      when: "weekend",
      rawText: "周末一起跑，轻松就好",
      city: "Shanghai",
      city_zh: "上海",
      buddyPrefRaw: "话不多",
      otherReqRaw: "轻松",
      skipRemotePersist: true,
    });
    const enumSoft = enumSoftMatchScore(mine, other, EMPTY_BUDDY_HARD_FILTERS, null);
    const vector = vectorMatchScore(mine, other, EMPTY_U, null);
    const scored = scoreWishCandidate(mine, other, EMPTY_U, {
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
    });
    expect(scored.enumSoft).toBe(enumSoft);
    expect(scored.vector).toBe(vector);
    expect(scored.total).toBeCloseTo(
      WISH_SCORE_WEIGHTS.enumSoft * enumSoft +
        WISH_SCORE_WEIGHTS.vector * vector +
        WISH_SCORE_WEIGHTS.aux * scored.aux,
      5,
    );
  });

  it("scores activity core vs core, not full sentences", () => {
    const mine = publishMyIntent({
      kind: "run",
      activityCore: "跑步",
      activityStrength: "flex",
      rawText: "这周末朝阳公园轻松慢跑",
      city: "Beijing",
      skipRemotePersist: true,
    });
    const similar = publishMyIntent({
      kind: "run",
      activityCore: "慢跑",
      rawText: "完全不同的长句描述地点天气心情",
      city: "Beijing",
      skipRemotePersist: true,
    });
    const different = publishMyIntent({
      kind: "bookstore",
      activityCore: "轻松读书",
      rawText: "这周末朝阳公园轻松慢跑",
      city: "Beijing",
      skipRemotePersist: true,
    });
    const simScore = vectorMatchScore(mine, similar, EMPTY_U, null);
    const diffScore = vectorMatchScore(mine, different, EMPTY_U, null);
    expect(simScore).toBeGreaterThan(diffScore);
  });
});
