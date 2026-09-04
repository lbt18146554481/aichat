import { describe, expect, it } from "vitest";
import { publishMyIntent } from "@/lib/intents";
import {
  intentCityId,
  intentIndexFromIntent,
  intentWhenTier,
  intentLevelTier,
  isIntentRecallable,
} from "@/lib/intent-index";

describe("intent-index", () => {
  it("builds index fields from intent", () => {
    const intent = publishMyIntent({
      kind: "run",
      when: "weekend",
      level: "beginner",
      rawText: "morning run",
      city: "Berlin",
      city_zh: "柏林",
    });
    const idx = intentIndexFromIntent(intent);
    expect(idx.kind).toBe("run");
    expect(idx.cityId).toBe(intentCityId(intent));
    expect(idx.status).toBe("active");
    expect(intentWhenTier(intent)).toBe("weekend");
    expect(intentLevelTier(intent)).toBe("beginner");
    expect(isIntentRecallable(intent)).toBe(true);
  });

  it("whenAny maps to any tier", () => {
    const intent = publishMyIntent({
      kind: "cook",
      rawText: "cook together",
      city: "Lisbon",
    });
    expect(intentWhenTier(intent)).toBe("any");
    expect(intentLevelTier(intent)).toBe("any");
  });
});
