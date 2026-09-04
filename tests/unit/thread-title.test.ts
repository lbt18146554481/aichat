import { describe, expect, it } from "vitest";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import {
  deriveHandoffSeed,
  deriveThreadTitle,
  isChipPrompt,
  matchmakerTitleMilestoneReady,
  sanitizeUserSeed,
} from "@/lib/thread-title";

describe("thread-title", () => {
  it("filters chip prompts", () => {
    expect(isChipPrompt("我想认识新朋友，请帮我转接到 Matchmaker。")).toBe(true);
    expect(isChipPrompt("I'd like to meet someone new — please connect me with Matchmaker.")).toBe(
      true,
    );
    expect(isChipPrompt("想认识安静一点的人")).toBe(false);
  });

  it("prefers LLM summary over user text", () => {
    expect(
      deriveThreadTitle({
        summary: "想找慢节奏、爱读书的人",
        userText: "我想认识新朋友，请帮我转接到 Matchmaker。",
      }),
    ).toBe("想找慢节奏、爱读书的人");
  });

  it("sanitizes user seed and skips chips", () => {
    expect(sanitizeUserSeed("我想认识新朋友，请帮我转接到 Matchmaker。")).toBe("");
    expect(sanitizeUserSeed("  想认识  安静的人  ")).toBe("想认识 安静的人");
  });

  it("deriveHandoffSeed falls back through grafted users", () => {
    expect(
      deriveHandoffSeed({
        summary: "",
        seed: "请帮我转接到 Matchmaker",
        graftedMessages: [
          { role: "user", content: "请帮我转接到 Matchmaker" },
          { role: "user", content: "在上海，周末一起逛独立书店" },
        ],
      }),
    ).toBe("在上海，周末一起逛独立书店");
  });

  it("detects matchmaker milestone readiness", () => {
    expect(
      matchmakerTitleMilestoneReady(
        { positive: ["安静"], negative: [], notes: [] },
        { ...EMPTY_HARD_FILTERS },
      ),
    ).toBe(true);
  });
});
