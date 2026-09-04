import { describe, expect, it } from "vitest";
import { publishMyIntent, seedPool, type Intent } from "@/lib/intents";
import {
  recallWishCandidates,
  recallWishWithRelaxation,
  WISH_RECALL_LIMIT,
  OTHER_SEMANTIC_MIN,
} from "@/lib/wish-recall";
import { EMPTY_WISH_HARD_FILTERS, EMPTY_BUDDY_HARD_FILTERS } from "@/lib/wish-types";
import { isIntentRecallable, WISH_INTENT_MAX_AGE_MS } from "@/lib/intent-index";

const EMPTY_U = { positive: [], negative: [], notes: [] };

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
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
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
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
    });
    if (result.candidates.length > 0) {
      expect(result.crossCityUsed).toBe(false);
    }
  });

  it("does not cross-city unless allowCrossCity", () => {
    const mine = publishMyIntent({
      kind: "tennis",
      when: "weekend",
      level: "intermediate",
      rawText: "tennis in a tiny town",
      city: "TinyTown",
      city_zh: "TinyTown",
    });
    const result = recallWishCandidates({
      mine,
      hardFilters: { cities: ["tinytown"], excludeCities: [], kinds: [] },
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool: seedPool(),
    });
    expect(result.crossCityUsed).toBe(false);
  });

  it("buckets exact matches before relaxed-when", () => {
    const mine = publishMyIntent({
      kind: "tennis",
      when: "weekend",
      level: "intermediate",
      rawText: "weekend tennis intermediate",
      city: "Berlin",
      city_zh: "柏林",
    });
    const pool = seedPool().filter((it) => it.kind === "tennis" && it.ownerId !== "me");
    const result = recallWishCandidates({
      mine,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool,
      limit: 8,
    });
    if (result.candidates.length >= 2) {
      const ranks = result.candidates.map((c) => c.quality);
      const firstRelaxed = ranks.indexOf("relaxed-when");
      const lastExact = ranks.lastIndexOf("exact");
      if (firstRelaxed >= 0 && lastExact >= 0) {
        expect(lastExact).toBeLessThan(firstRelaxed);
      }
    }
  });

  it("filters expired intents", () => {
    const old: Intent = {
      ...seedPool()[0]!,
      id: "old-intent",
      createdAt: Date.now() - WISH_INTENT_MAX_AGE_MS - 1,
      status: "active",
    };
    expect(isIntentRecallable(old)).toBe(false);
  });

  it("ensureMatchable relaxes strictWhen when empty", () => {
    const mine = publishMyIntent({
      kind: "tennis",
      when: "weekend",
      level: "intermediate",
      rawText: "strict weekend tennis",
      city: "Berlin",
      city_zh: "柏林",
      strictWhen: true,
    });
    const pool = seedPool();
    const strict = recallWishCandidates({
      mine,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool,
    });
    const relaxed = recallWishWithRelaxation(
      {
        mine,
        hardFilters: EMPTY_WISH_HARD_FILTERS,
        buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
        pool,
      },
      "zh-CN",
    );
    expect(relaxed.filtersRelaxed || relaxed.candidates.length >= strict.candidates.length).toBe(
      true,
    );
  });

  it("seed pool has ~40 entries", () => {
    expect(seedPool().length).toBeGreaterThanOrEqual(38);
  });

  it("recalls Beijing weekend walk seeds for similar wishes", () => {
    const mine = publishMyIntent({
      kind: "other",
      when: "weekend",
      rawText: "周末轻松散步，户外走走",
      city: "Beijing",
      city_zh: "北京",
    });
    const result = recallWishCandidates({
      mine,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool: seedPool(),
    });
    const ids = result.candidates.map((c) => c.id);
    expect(ids.some((id) => id.startsWith("extra:beijing-walk"))).toBe(true);
  });

  it("other semantic threshold is sane", () => {
    expect(OTHER_SEMANTIC_MIN).toBeGreaterThan(0);
    expect(OTHER_SEMANTIC_MIN).toBeLessThan(0.5);
  });

  it("online wishes only match other online wishes", () => {
    const mine: Intent = {
      ...publishMyIntent({
        kind: "other",
        rawText: "线上一起练口语",
        city: "",
        city_zh: "",
        placeRaw: "线上",
        placeOnline: true,
      }),
      id: "mine-online",
      ownerId: "me",
    };
    const onlineOther: Intent = {
      id: "other-online",
      ownerId: "seed-online",
      ownerName: "Alex",
      ownerName_zh: "Alex",
      ownerCity: "",
      ownerCity_zh: "",
      city: "",
      city_zh: "",
      kind: "other",
      level: "intermediate",
      day: "sat",
      window: "evening",
      venue: "",
      venue_zh: "",
      rawText: "线上英语口语",
      rawText_zh: "线上英语口语",
      whenAny: true,
      levelAny: true,
      status: "active",
      placeRaw: "线上",
      placeOnline: true,
      createdAt: Date.now(),
    };
    const offlineOther: Intent = {
      id: "other-offline",
      ownerId: "seed-offline",
      ownerName: "Bo",
      ownerName_zh: "Bo",
      ownerCity: "Beijing",
      ownerCity_zh: "北京",
      city: "Beijing",
      city_zh: "北京",
      kind: "other",
      level: "intermediate",
      day: "sat",
      window: "evening",
      venue: "",
      venue_zh: "",
      rawText: "北京线下咖啡",
      rawText_zh: "北京线下咖啡",
      whenAny: true,
      levelAny: true,
      status: "active",
      placeRaw: "北京",
      createdAt: Date.now(),
    };
    const result = recallWishCandidates({
      mine,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool: [onlineOther, offlineOther],
    });
    expect(result.candidates.some((c) => c.id === onlineOther.id)).toBe(true);
    expect(result.candidates.some((c) => c.id === offlineOther.id)).toBe(false);
  });

  it("offline wishes do not match online wishes", () => {
    const mine = publishMyIntent({
      kind: "run",
      when: "weekend",
      rawText: "周末跑步",
      city: "Berlin",
      city_zh: "柏林",
      placeRaw: "柏林",
    });
    const onlineOther: Intent = {
      id: "other-online-run",
      ownerId: "seed-online-run",
      ownerName: "Cara",
      ownerName_zh: "Cara",
      ownerCity: "",
      ownerCity_zh: "",
      city: "",
      city_zh: "",
      kind: "run",
      level: "intermediate",
      day: "sat",
      window: "morning",
      venue: "",
      venue_zh: "",
      rawText: "线上一起跑步打卡",
      rawText_zh: "线上一起跑步打卡",
      whenAny: false,
      levelAny: true,
      status: "active",
      placeRaw: "线上",
      placeOnline: true,
      createdAt: Date.now(),
    };
    const result = recallWishCandidates({
      mine,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool: [onlineOther],
    });
    expect(result.candidates.some((c) => c.id === onlineOther.id)).toBe(false);
  });

  it("browseStrict does not silently cross-city when same-city is empty", () => {
    const mine = publishMyIntent({
      kind: "climb",
      when: "weekend",
      level: "intermediate",
      rawText: "这周末北京户外爬山",
      city: "Beijing",
      city_zh: "北京",
    });
    const pool = seedPool();
    const relaxed = recallWishWithRelaxation(
      {
        mine,
        hardFilters: { cities: ["beijing"], excludeCities: [], kinds: ["climb"] },
        buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
        understanding: EMPTY_U,
        pool,
      },
      "zh-CN",
    );
    const browse = recallWishWithRelaxation(
      {
        mine,
        hardFilters: { cities: ["beijing"], excludeCities: [], kinds: ["climb"] },
        buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
        understanding: EMPTY_U,
        pool,
        browseStrict: true,
      },
      "zh-CN",
    );
    if (relaxed.crossCityUsed) {
      expect(browse.crossCityUsed).toBe(false);
      expect(browse.candidates.length).toBe(0);
    }
  });

  it("browse draft ownerId does not collide with published me wishes", async () => {
    const { draftAsIntent, DRAFT_BROWSE_OWNER_ID } = await import("@/lib/wish-draft-intent");
    const draft = draftAsIntent({
      kind: "run",
      rawText: "这周末在朝阳公园走跑",
      city: "Beijing",
      city_zh: "北京",
      when: "weekend",
      whenAny: false,
      levelAny: true,
      dateStart: "2026-09-05",
      dateEnd: "2026-09-06",
    });
    expect(draft.ownerId).toBe(DRAFT_BROWSE_OWNER_ID);
    const result = recallWishCandidates({
      mine: draft,
      hardFilters: { cities: ["beijing"], excludeCities: [], kinds: ["run"] },
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool: seedPool(),
      browseStrict: true,
    });
    expect(result.candidates.some((c) => c.id === "extra:beijing-walk-3")).toBe(true);
  });

  it("treats broad 运动 queries as compatible with run/walk sports wishes", async () => {
    const { draftAsIntent } = await import("@/lib/wish-draft-intent");
    const draft = draftAsIntent({
      kind: "other",
      rawText: "运动类活动",
      city: "Beijing",
      city_zh: "北京",
      when: "weekend",
      whenAny: false,
      levelAny: true,
      dateStart: "2026-09-05",
      dateEnd: "2026-09-06",
    });
    const result = recallWishCandidates({
      mine: draft,
      hardFilters: { cities: ["beijing"], excludeCities: [], kinds: [] },
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      pool: seedPool(),
      browseStrict: true,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some((c) => c.id.startsWith("extra:beijing-walk-"))).toBe(true);
  });
});
