import { describe, expect, it } from "vitest";
import {
  activityFitScore,
  buildActivityQuery,
  recallSidePeople,
  sidePlaceHardFilters,
} from "@/lib/side-people-recall";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import { emptyWishDraft } from "@/lib/wish-types";
import { emptyUnderstanding } from "@/lib/handoff";
import type { Person } from "@/lib/types";
import type { Profile } from "@/lib/profile-shape";

function person(partial: Partial<Person> & { id: string }): Person {
  return {
    name: partial.name ?? partial.id,
    name_zh: partial.name_zh ?? partial.name ?? partial.id,
    city: partial.city ?? "Shanghai",
    city_zh: partial.city_zh ?? "上海",
    age: partial.age ?? 28,
    gender: partial.gender ?? "female",
    occupation: partial.occupation ?? "designer",
    occupation_zh: partial.occupation_zh ?? "设计师",
    profileText: partial.profileText ?? "",
    ...partial,
  } as Person;
}

describe("side-people-recall", () => {
  it("builds activity query from draft fields", () => {
    const q = buildActivityQuery({
      ...emptyWishDraft(),
      kind: "tennis",
      activityCore: "打网球",
      rawText: "周末想找人打网球",
    });
    expect(q).toContain("打网球");
    expect(q.length).toBeGreaterThan(2);
  });

  it("activityFitScore is 0 when query or profileText missing", () => {
    expect(activityFitScore("", person({ id: "a", profileText: "loves tennis" }))).toBe(0);
    expect(activityFitScore("tennis", person({ id: "a", profileText: "" }))).toBe(0);
  });

  it("forces place hard filters from draft/profile city", () => {
    const draft = { ...emptyWishDraft(), city: "Beijing", city_zh: "北京" };
    const hard = sidePlaceHardFilters(draft, { city: "Shanghai" } as Profile, {
      ...EMPTY_HARD_FILTERS,
    });
    expect(hard.cities.length).toBeGreaterThan(0);
    expect(hard.cityStrength).toBe("hard");
  });

  it("ranks by 50/50 person + activity after hard filter", () => {
    const pool = [
      person({
        id: "tennis-fan",
        city: "Shanghai",
        city_zh: "上海",
        profileText: "I love tennis and weekend matches on clay courts",
      }),
      person({
        id: "cook-fan",
        city: "Shanghai",
        city_zh: "上海",
        profileText: "Home cook who hosts dinner parties",
      }),
      person({
        id: "other-city",
        city: "Beijing",
        city_zh: "北京",
        profileText: "I love tennis",
      }),
    ];
    const draft = {
      ...emptyWishDraft(),
      kind: "tennis" as const,
      activityCore: "tennis",
      rawText: "找人打网球",
      city: "Shanghai",
    };
    const hard = sidePlaceHardFilters(draft, null, { ...EMPTY_HARD_FILTERS });
    const result = recallSidePeople({
      understanding: emptyUnderstanding(),
      hardFilters: hard,
      wishDraft: draft,
      blockedIds: [],
      shownIds: [],
      passedIds: [],
      pool,
    });
    expect(result.candidates.map((c) => c.id)).not.toContain("other-city");
    expect(result.candidates[0]?.id).toBe("tennis-fan");
  });
});
