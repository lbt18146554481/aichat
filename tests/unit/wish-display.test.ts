import { describe, expect, it } from "vitest";
import { formatWishContentLines, defaultMatchReason } from "@/lib/wish-display";
import type { Intent } from "@/lib/intents";

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
    rawText: "周末慢跑",
    rawText_zh: "周末慢跑",
    activityDescRaw: "周末慢跑",
    buddyPrefRaw: "话多一点",
    dateStart: "2026-03-07",
    timeStart: "09:00",
    timeEnd: "10:00",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("wish-display", () => {
  it("formats wish content lines", () => {
    const lines = formatWishContentLines(intent(), "zh-CN");
    expect(lines.activity).toContain("慢跑");
    expect(lines.buddyPref).toBe("话多一点");
    expect(lines.time).toContain("2026");
    expect(lines.place).toBeTruthy();
  });

  it("defaults buddy pref when empty", () => {
    const lines = formatWishContentLines(intent({ buddyPrefRaw: "" }), "zh-CN");
    expect(lines.buddyPref).toBe("不限");
  });

  it("provides default match reason", () => {
    expect(defaultMatchReason("zh-CN")).toContain("接近");
  });
});
