// Profile completeness = the Say hello gate.
//
// `isVitalsComplete` is the exact predicate that decides whether tapping
// "Say hello" opens the composer or bounces the user to /profile, so a
// regression here is the bug the user has hit repeatedly.

import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  addFavorite,
  isProfileComplete,
  isVitalsComplete,
  loadProfile,
  removeFavorite,
  saveProfile,
  toggleHidden,
  isHidden,
  upsertMoment,
  _resetProfileCache,
  type Profile,
} from "@/lib/profile";

const VITALS: Profile = {
  ...EMPTY_PROFILE,
  name: "Ada",
  age: 30,
  city: "Lisbon",
  occupation: "Translator",
};

beforeEach(() => {
  window.localStorage.clear();
  _resetProfileCache();
});

describe("say hello gate (vitals)", () => {
  it("blocks an empty profile", () => {
    expect(isVitalsComplete(EMPTY_PROFILE)).toBe(false);
  });

  it("passes once name, age, city and occupation are set", () => {
    expect(isVitalsComplete(VITALS)).toBe(true);
  });

  it("does not require moments, favorites or optional fields", () => {
    expect(VITALS.moments).toHaveLength(0);
    expect(VITALS.mbti).toBe("");
    expect(isVitalsComplete(VITALS)).toBe(true);
  });

  it("rejects under-18 and blank-ish values", () => {
    expect(isVitalsComplete({ ...VITALS, age: 17 })).toBe(false);
    expect(isVitalsComplete({ ...VITALS, city: "   " })).toBe(false);
    expect(isVitalsComplete({ ...VITALS, name: "" })).toBe(false);
  });

  it("survives a save/load round trip, so a completed profile is not re-asked", () => {
    saveProfile(VITALS);
    expect(isVitalsComplete(loadProfile())).toBe(true);
  });
});

describe("full profile", () => {
  it("needs 3 moments and 1 favorite on top of vitals", () => {
    let p = VITALS;
    expect(isProfileComplete(p)).toBe(false);
    p = upsertMoment(p, "m1", "I walk home the long way.");
    p = upsertMoment(p, "m2", "I read in the bath.");
    p = upsertMoment(p, "m3", "I cook on Sundays.");
    expect(isProfileComplete(p)).toBe(false);
    p = addFavorite(p, { kind: "book", title: "Ways of Seeing", why: "It changed how I look." });
    expect(isProfileComplete(p)).toBe(true);
    p = removeFavorite(p, 0);
    expect(isProfileComplete(p)).toBe(false);
  });

  it("replaces an answer for the same prompt instead of duplicating it", () => {
    let p = upsertMoment(VITALS, "m1", "first");
    p = upsertMoment(p, "m1", "second");
    expect(p.moments).toHaveLength(1);
    expect(p.moments[0].answer).toBe("second");
  });
});

describe("visibility", () => {
  it("toggles a field on and off", () => {
    const hiddenAge = toggleHidden(VITALS, "age");
    expect(isHidden(hiddenAge, "age")).toBe(true);
    expect(isHidden(toggleHidden(hiddenAge, "age"), "age")).toBe(false);
  });
});

describe("server-backed profile cache", () => {
  it("starts empty before hydrate", () => {
    const p = loadProfile();
    expect(p.name).toBe("");
    expect(p.bio).toBeUndefined();
  });
});
