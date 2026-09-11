import { describe, expect, it } from "vitest";
import { detectReplyLangFromText, resolveReplyLang } from "@/lib/lang";

describe("reply language detection", () => {
  it("detects Chinese from CJK text", () => {
    expect(detectReplyLangFromText("想找个上海的女生一起跑步")).toBe("zh-CN");
  });

  it("detects English from Latin text", () => {
    expect(detectReplyLangFromText("Looking for someone to hike with in Shanghai")).toBe("en");
  });

  it("prefers Chinese when mixed with enough CJK", () => {
    expect(detectReplyLangFromText("OK，帮我找个搭子")).toBe("zh-CN");
  });

  it("resolves from history when current message is empty", () => {
    expect(
      resolveReplyLang({
        userMessage: "",
        history: [
          { role: "user", content: "Find me a tennis buddy" },
          { role: "assistant", content: "Sure" },
        ],
      }),
    ).toBe("en");
  });

  it("does not use UI lang — falls back to zh-CN", () => {
    expect(resolveReplyLang({ userMessage: "🙂" })).toBe("zh-CN");
  });
});
