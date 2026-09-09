import { describe, expect, it } from "vitest";
import {
  applyMatchmakerColdStart,
  applySideBuddyColdStart,
  applySidePlaceColdStart,
} from "@/lib/cold-start-prefs";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import { EMPTY_BUDDY_HARD_FILTERS, emptyWishDraft } from "@/lib/wish-types";
import type { Profile } from "@/lib/profile-shape";

const profile = {
  gender: "male",
  age: 28,
  city: "Beijing",
  favorites: [],
  moments: [],
} as Profile;

describe("cold-start-prefs", () => {
  it("matchmaker: opposite gender / near age / city as flex", () => {
    const f = applyMatchmakerColdStart(profile, { ...EMPTY_HARD_FILTERS });
    expect(f.genders).toEqual(["female"]);
    expect(f.genderStrength).toBe("flex");
    expect(f.ageMin).toBe(21);
    expect(f.ageMax).toBe(35);
    expect(f.ageStrength).toBe("flex");
    expect(f.cities).toEqual(["Beijing"]);
    expect(f.cityStrength).toBe("flex");
  });

  it("matchmaker: does not override user-extracted dims", () => {
    const f = applyMatchmakerColdStart(profile, {
      ...EMPTY_HARD_FILTERS,
      genders: ["male"],
      genderStrength: "hard",
      ageMin: 30,
      ageMax: 35,
      ageStrength: "hard",
      cities: ["Shanghai"],
      cityStrength: "hard",
    });
    expect(f.genders).toEqual(["male"]);
    expect(f.genderStrength).toBe("hard");
    expect(f.ageMin).toBe(30);
    expect(f.cities).toEqual(["Shanghai"]);
  });

  it("matchmaker: nonbinary prefers nonbinary", () => {
    const f = applyMatchmakerColdStart(
      { ...profile, gender: "nonbinary" },
      { ...EMPTY_HARD_FILTERS },
    );
    expect(f.genders).toEqual(["nonbinary"]);
    expect(f.genderStrength).toBe("flex");
  });

  it("side buddy: gender + age flex without hard-locking", () => {
    const { buddy, buddyGenderStrength, buddyAgeStrength } = applySideBuddyColdStart(
      profile,
      { ...EMPTY_BUDDY_HARD_FILTERS },
    );
    expect(buddy.genders).toEqual(["female"]);
    expect(buddyGenderStrength).toBe("flex");
    expect(buddy.ageMin).toBe(21);
    expect(buddy.ageMax).toBe(35);
    expect(buddyAgeStrength).toBe("flex");
  });

  it("side place: fills city flex when draft empty", () => {
    const d = applySidePlaceColdStart(profile, emptyWishDraft());
    expect(d.city).toBe("Beijing");
    expect(d.placeStrength).toBe("flex");
    expect(d.placeFlex).toBe(true);
  });

  it("side place: skips when place already set", () => {
    const d = applySidePlaceColdStart(profile, {
      ...emptyWishDraft(),
      city: "Shanghai",
      placeRaw: "上海",
    });
    expect(d.city).toBe("Shanghai");
  });
});
