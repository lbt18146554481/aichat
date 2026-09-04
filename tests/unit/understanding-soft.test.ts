import { describe, expect, it } from "vitest";
import {
  mergePositiveBag,
  normalizeUnderstandingShape,
  softPrefsPresent,
} from "@/lib/understanding";

describe("understanding soft prefs", () => {
  it("merges structured fields into positive", () => {
    const positive = mergePositiveBag({
      traits: ["安静"],
      interests: ["读书"],
      occupation: ["设计师"],
      pace: ["慢热"],
    });
    expect(positive).toEqual(expect.arrayContaining(["安静", "读书", "设计师", "慢热"]));
  });

  it("normalizeUnderstandingShape fills defaults", () => {
    const u = normalizeUnderstandingShape({ positive: ["幽默"], negative: [], notes: [] });
    expect(u.traits).toEqual([]);
    expect(u.positive).toContain("幽默");
    expect(softPrefsPresent(u)).toBe(true);
  });
});
