import { describe, expect, it } from "vitest";
import { SEED_PERSON_IDS } from "@/lib/people-seed.ids";
import { TEST_PEOPLE_POOL } from "../fixtures/people-pool";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import {
  createMatchmakerToolState,
  executeMatchmakerTool,
} from "@/lib/matchmaker-tools.server";
import {
  createSideToolState,
  executeSideTool,
} from "@/lib/side-tools.server";
import { EMPTY_WISH_HARD_FILTERS, EMPTY_BUDDY_HARD_FILTERS, emptyWishDraft } from "@/lib/wish-types";

function mmState(overrides: Partial<Parameters<typeof createMatchmakerToolState>[0]> = {}) {
  return createMatchmakerToolState({
    lang: "zh-CN",
    pool: TEST_PEOPLE_POOL,
    hardFilters: { ...EMPTY_HARD_FILTERS },
    understanding: { positive: [], negative: [], notes: [] },
    blockedPersonIds: [],
    shownIds: [],
    passedIds: [],
    currentPersonId: null,
    ...overrides,
  });
}

describe("matchmaker tools", () => {
  it("update_filters maps 中国 and previews pool", () => {
    const state = mmState();
    const result = executeMatchmakerTool(state, "update_filters", {
      cities: ["中国"],
    }) as { ok: boolean; hardFilters: { cities: string[] }; poolCount: number };

    expect(result.ok).toBe(true);
    expect(state.filtersTouched).toBe(true);
    expect(result.hardFilters.cities).toEqual(["cn"]);
    expect(result.poolCount).toBeGreaterThan(0);
  });

  it("preview_pool for Portugal includes Lisbon people", () => {
    const state = mmState();
    const result = executeMatchmakerTool(state, "preview_pool", {
      cities: ["葡萄牙"],
    }) as { count: number; sample: Array<{ id: string }> };

    expect(result.count).toBeGreaterThan(0);
    expect(result.sample.some((s) => s.id === "isa")).toBe(true);
  });

  it("get_person returns localized fields", () => {
    const state = mmState({ lang: "en" });
    const result = executeMatchmakerTool(state, "get_person", {
      personId: "theo",
    }) as { id: string; city: string };

    expect(result.id).toBe("theo");
    expect(result.city.toLowerCase()).toContain("berlin");
  });

  it("explain_mismatch explains Berlin vs China", () => {
    const state = mmState({
      hardFilters: { ...EMPTY_HARD_FILTERS, cities: ["cn"] },
    });
    const result = executeMatchmakerTool(state, "explain_mismatch", {
      personId: "theo",
    }) as { matches: boolean; reasons: string[] };

    expect(result.matches).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("pool_facets reports relax hint when age filter is too tight", () => {
    const state = mmState({
      hardFilters: { ...EMPTY_HARD_FILTERS, ageMax: 20 },
    });
    const result = executeMatchmakerTool(state, "pool_facets", {}) as {
      totalInPool: number;
      matchingNow: number;
      relaxHints: Array<{ field: string; countIfRelaxed: number }>;
      tip: string;
    };

    expect(result.totalInPool).toBe(SEED_PERSON_IDS.length);
    expect(result.matchingNow).toBe(0);
    expect(result.relaxHints.some((h) => h.field === "age" && h.countIfRelaxed > 0)).toBe(true);
    expect(result.tip).toMatch(/年龄|age/i);
  });

  it("browse_next_person signals client queue advance", () => {
    const state = mmState({ rankedQueueLength: 5, currentPersonId: "theo" });
    const result = executeMatchmakerTool(state, "browse_next_person", {
      mode: "pass",
    }) as { ok: boolean; mode: string };

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("pass");
    expect(state.queueAdvance).toBe("pass");
  });

  it("browse_next_person errors without queue", () => {
    const state = mmState();
    const result = executeMatchmakerTool(state, "browse_next_person", {
      mode: "see",
    }) as { error: string };

    expect(result.error).toBe("no_queue");
    expect(state.queueAdvance).toBeNull();
  });

  it("request_rematch stages rematch and patches filters", () => {
    const state = mmState({ rankedQueueLength: 3 });
    const result = executeMatchmakerTool(state, "request_rematch", {
      cities: ["Germany"],
    }) as { ok: boolean; needsUserConfirm: boolean; poolCount: number };

    expect(result.ok).toBe(true);
    expect(result.needsUserConfirm).toBe(true);
    expect(state.requestRematch).toBe(true);
    expect(state.filtersTouched).toBe(true);
    expect(state.hardFilters.cities).toEqual(["de"]);
    expect(result.poolCount).toBeGreaterThan(0);
  });

  it("pass_person marks pass and suggests next", () => {
    const state = mmState({ currentPersonId: "theo" });
    const result = executeMatchmakerTool(state, "pass_person", {
      personId: "theo",
    }) as { passedId: string; nextPersonId: string | null };

    expect(result.passedId).toBe("theo");
    expect(state.passCurrentPerson).toBe(true);
    expect(state.passedIds).toContain("theo");
    expect(result.nextPersonId).not.toBe("theo");
  });

  it("search_people returns roster ids", () => {
    const state = mmState();
    const result = executeMatchmakerTool(state, "search_people", {
      cities: ["Germany"],
      limit: 3,
    }) as { candidates: Array<{ id: string }>; empty: boolean };

    expect(result.empty).toBe(false);
    expect(result.candidates.some((c) => c.id === "theo")).toBe(true);
    expect(state.lastSearchIds.length).toBeGreaterThan(0);
  });
});

describe("side tools", () => {
  function sideState() {
    return createSideToolState({
      lang: "zh-CN",
      hardFilters: { ...EMPTY_WISH_HARD_FILTERS },
      buddyHardFilters: { ...EMPTY_BUDDY_HARD_FILTERS },
      understanding: { positive: [], negative: [], notes: [] },
      wishDraft: emptyWishDraft(),
      pendingConfirm: null,
      myIntentId: null,
      matchIntentId: null,
      triedIntentIds: [],
      triedOwnerIds: [],
    });
  }

  it("update_wish_draft sets kind and when", () => {
    const state = sideState();
    const result = executeSideTool(state, "update_wish_draft", {
      kind: "tennis",
      when: "weekend",
      level: "beginner",
      rawText: "周末打网球",
    }) as { ok: boolean };

    expect(result.ok).toBe(true);
    expect(state.wishDraft.kind).toBe("tennis");
    expect(state.wishDraft.when).toBe("weekend");
    expect(state.draftTouched).toBe(true);
  });

  it("preview_wish_matches needs kind", () => {
    const state = sideState();
    const empty = executeSideTool(state, "preview_wish_matches", {}) as {
      empty: boolean;
    };
    expect(empty.empty).toBe(true);

    executeSideTool(state, "update_wish_draft", { kind: "tennis", rawText: "打球" });
    const preview = executeSideTool(state, "preview_wish_matches", {}) as {
      count: number;
    };
    expect(preview.count).toBeGreaterThanOrEqual(0);
  });

  it("confirm_publish_wish sets form prefill only", () => {
    const state = sideState();
    executeSideTool(state, "update_wish_draft", { kind: "run", rawText: "跑步" });
    const result = executeSideTool(state, "confirm_publish_wish", {
      confirmLine: "周末一起跑步，可以吗？",
    }) as { pendingConfirm: string; tip: string };

    expect(state.affirmPublish).toBe(false);
    expect(result.pendingConfirm).toContain("跑步");
    expect(state.pendingConfirm).toContain("跑步");
  });

  it("update_wish_filters normalizes China", () => {
    const state = sideState();
    const result = executeSideTool(state, "update_wish_filters", {
      cities: ["China"],
    }) as { hardFilters: { cities: string[] } };

    expect(result.hardFilters.cities).toEqual(["cn"]);
    expect(state.filtersTouched).toBe(true);
  });
});
