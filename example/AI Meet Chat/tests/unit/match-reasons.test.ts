// Match reasons must never be invented.
//
// The rule the product depends on: every reason traces back to text a human
// actually wrote (a Moment, or a Favorite both sides listed). If nothing
// holds, we return nothing rather than a plausible-sounding blurb.

import { describe, expect, it } from "vitest";
import { buildReasons } from "@/lib/match-reasons";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { EMPTY_UNDERSTANDING, type UserUnderstanding } from "@/lib/understanding";
import { PEOPLE } from "@/lib/people";

const person = PEOPLE[0];
const profile: Profile = {
  ...EMPTY_PROFILE,
  name: "Ada",
  age: 30,
  city: "Lisbon",
  occupation: "Writer",
};
const blank: UserUnderstanding = { ...EMPTY_UNDERSTANDING };

describe("buildReasons", () => {
  it("returns nothing when the user has said nothing and shares nothing", () => {
    expect(buildReasons(person, profile, blank, "en")).toEqual([]);
  });

  it("quotes the person's own moment when the user's words overlap it", () => {
    const theirMoment = person.moments[0];
    const overlap = theirMoment.answer.split(/\s+/).slice(0, 8).join(" ");
    const u: UserUnderstanding = { ...blank, notes: [overlap] };
    const reasons = buildReasons(person, profile, u, "en");
    const said = reasons.find((r) => r.kind === "you_said");
    expect(said).toBeTruthy();
    if (said?.kind === "you_said") {
      // The evidence id must point at a real moment of theirs.
      expect(person.moments.some((m) => m.id === said.sourceId)).toBe(true);
    }
  });

  it("surfaces a favorite only when both sides listed the same title", () => {
    const theirFav = person.favorites?.[0];
    expect(theirFav).toBeTruthy();
    const shared: Profile = {
      ...profile,
      favorites: [{ kind: "book", title: theirFav!.title, why: "It stayed with me." }],
    };
    const reasons = buildReasons(person, shared, blank, "en");
    expect(reasons.some((r) => r.kind === "favorite")).toBe(true);
    // And not when the titles differ.
    const other: Profile = {
      ...profile,
      favorites: [{ kind: "book", title: "A Title Nobody Else Listed", why: "Mine." }],
    };
    expect(buildReasons(person, other, blank, "en").some((r) => r.kind === "favorite")).toBe(false);
  });

  it("never returns more than three reasons", () => {
    const u: UserUnderstanding = {
      ...blank,
      notes: person.moments.map((m) => m.answer),
      positive: [...person.signals],
    };
    const shared: Profile = {
      ...profile,
      favorites: (person.favorites ?? []).map((f) => ({
        kind: f.kind,
        title: f.title,
        why: "Mine too.",
      })),
    };
    expect(buildReasons(person, shared, u, "en").length).toBeLessThanOrEqual(3);
  });

  it("uses the person's Chinese text when the UI is in Chinese", () => {
    const zhMoment = person.moments[0];
    const u: UserUnderstanding = { ...blank, notes: [zhMoment.answer_zh] };
    const reasons = buildReasons(person, profile, u, "zh-CN");
    const said = reasons.find((r) => r.kind === "you_said");
    if (said?.kind === "you_said") {
      expect(said.theirs).not.toMatch(/^[\x20-\x7e]+$/);
    }
  });
});
