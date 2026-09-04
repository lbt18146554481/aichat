import { describe, expect, it } from "vitest";
import type { Intent } from "@/lib/intents";
import {
  buddyHardFiltersFromMatchQuery,
  passesBuddyStrictMatch,
  softBuddyDemographicScore,
} from "@/lib/buddy-match";
import type { BuddyMatchQuery } from "@/lib/wish-match-profile";

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: "x",
    ownerId: "p1",
    ownerName: "A",
    ownerName_zh: "A",
    ownerCity: "上海",
    ownerCity_zh: "上海",
    city: "上海",
    city_zh: "上海",
    kind: "run",
    level: "intermediate",
    day: "sat",
    window: "morning",
    venue: "",
    venue_zh: "",
    rawText: "跑步",
    rawText_zh: "跑步",
    createdAt: Date.now(),
    ownerSnapshot: {
      name: "A",
      name_zh: "A",
      gender: "female",
      age: 28,
      city: "上海",
      city_zh: "上海",
    },
    ...overrides,
  };
}

describe("buddy-match", () => {
  it("strict gender filters out non-matching owner", () => {
    const q: BuddyMatchQuery = {
      genders: ["female"],
      genderMode: "strict",
      ageMin: null,
      ageMax: null,
      ageMode: null,
      personalityTags: [],
      personalityQueryText: "",
    };
    expect(passesBuddyStrictMatch(intent(), q)).toBe(true);
    expect(
      passesBuddyStrictMatch(
        intent({
          ownerSnapshot: {
            name: "B",
            name_zh: "B",
            gender: "male",
            age: 30,
            city: "上海",
            city_zh: "上海",
          },
        }),
        q,
      ),
    ).toBe(false);
  });

  it("soft gender adds score without filtering", () => {
    const q: BuddyMatchQuery = {
      genders: ["female"],
      genderMode: "soft",
      ageMin: null,
      ageMax: null,
      ageMode: null,
      personalityTags: [],
      personalityQueryText: "",
    };
    expect(passesBuddyStrictMatch(intent(), q)).toBe(true);
    expect(softBuddyDemographicScore(intent(), q)).toBeGreaterThan(0);
  });

  it("derives legacy hard filters from strict query only", () => {
    const q: BuddyMatchQuery = {
      genders: ["female"],
      genderMode: "strict",
      ageMin: 25,
      ageMax: 35,
      ageMode: "strict",
      personalityTags: ["话多"],
      personalityQueryText: "话多",
    };
    const hard = buddyHardFiltersFromMatchQuery(q);
    expect(hard.genders).toEqual(["female"]);
    expect(hard.ageMin).toBe(25);
    expect(hard.ageMax).toBe(35);
  });
});
