import { describe, expect, it } from "vitest";
import {
  CULTURE_SCORE,
  cultureAffinityScoreFromProfilePerson,
  sharedFavoriteScore,
  normFavoriteTitle,
} from "@/lib/culture-affinity";
import type { Profile } from "@/lib/profile-shape";
import type { Person } from "@/lib/types";

describe("culture-affinity", () => {
  it("normalizes favorite titles for overlap", () => {
    expect(normFavoriteTitle("《三体》")).toBe("三体");
    expect(sharedFavoriteScore(["三体"], ["《三体》"])).toBe(CULTURE_SCORE.sharedFavorite);
  });

  it("scores shared favorites between profile and person", () => {
    const profile = {
      favorites: [{ kind: "book" as const, title: "Normal People", why: "slow burn" }],
      moments: [],
    } as Profile;
    const person = {
      favorites: [{ title: "Normal People", title_zh: "正常人", why: "", why_zh: "" }],
      moments: [],
    } as Person;
    expect(cultureAffinityScoreFromProfilePerson(profile, person)).toBeGreaterThanOrEqual(
      CULTURE_SCORE.sharedFavorite,
    );
  });

  it("returns 0 without profile", () => {
    expect(cultureAffinityScoreFromProfilePerson(null, { favorites: [] } as Person)).toBe(0);
  });
});
