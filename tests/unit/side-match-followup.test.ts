import { describe, expect, it } from "vitest";
import { sideMatchAckFallback } from "@/lib/side-match-followup-llm.server";

describe("side-match-followup", () => {
  it("uses browse wording for ack fallback", () => {
    expect(sideMatchAckFallback("zh-CN", "这周末北京爬山", "browse")).toContain("条件记下");
    expect(sideMatchAckFallback("zh-CN", "这周末北京爬山", "browse")).not.toContain("心愿记下");
    expect(sideMatchAckFallback("zh-CN", "这周末北京爬山", "publish")).toContain("心愿记下");
  });
});
