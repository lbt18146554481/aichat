import { describe, expect, it } from "vitest";
import { profileSummary, profileSummaryForPrompt } from "@/lib/profile-summary";
import { EMPTY_PROFILE } from "@/lib/profile-shape";

describe("profileSummary", () => {
  it("returns sparse marker for empty profile", () => {
    expect(profileSummary({ ...EMPTY_PROFILE }, "zh-CN")).toBe("（资料较少）");
    expect(profileSummary({ ...EMPTY_PROFILE }, "en")).toBe("(sparse)");
  });

  it("includes core fields when present", () => {
    const summary = profileSummary(
      {
        ...EMPTY_PROFILE,
        name: "小明",
        age: 28,
        city: "上海",
        occupation: "设计师",
        traits: ["introvert"],
        interests: ["hiking", "film"],
        moments: [{ promptId: "m1", answer: "最近在学做咖啡" }],
      },
      "zh-CN",
    );
    expect(summary).toContain("叫小明");
    expect(summary).toContain("28岁");
    expect(summary).toContain("在上海");
    expect(summary).toContain("设计师");
    expect(summary).toContain("近况：最近在学做咖啡");
  });
});

describe("profileSummaryForPrompt", () => {
  it("warns not to interrogate when sparse", () => {
    const block = profileSummaryForPrompt({ ...EMPTY_PROFILE }, "zh-CN");
    expect(block).toContain("较少");
    expect(block).toContain("不要盘问");
  });

  it("labels profile as the user themselves", () => {
    const block = profileSummaryForPrompt(
      { ...EMPTY_PROFILE, name: "Alex", city: "Berlin", age: 30 },
      "en",
    );
    expect(block).toContain("themselves");
    expect(block).toContain("Alex");
  });
});
