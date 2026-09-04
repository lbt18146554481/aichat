import { describe, expect, it } from "vitest";
import { EMPTY, sendChatMessage, startChat } from "@/lib/agents/side-by-side";

describe("side-by-side chat", () => {
  it("startChat enters chat with composer wish quote", () => {
    const s = startChat(
      { ...EMPTY, matchIntentId: "seed-bj-walk-1", stage: "published" },
      undefined,
      "zh-CN",
    );
    expect(s.stage).toBe("chat");
    expect(s.chatMessages).toHaveLength(0);
    expect(s.composerWishQuoteId).toBe("seed-bj-walk-1");
  });

  it("sendChatMessage attaches wish card and text", () => {
    const base = startChat(
      { ...EMPTY, matchIntentId: "seed-bj-walk-1", stage: "published" },
      undefined,
      "zh-CN",
    );
    const next = sendChatMessage(base, "你好呀", {
      attachWishCard: true,
      wishIntentId: "seed-bj-walk-1",
    });
    expect(next.chatMessages).toHaveLength(2);
    expect(next.chatMessages[0]?.kind).toBe("wish_card");
    expect(next.chatMessages[1]?.text).toBe("你好呀");
    expect(next.composerWishQuoteId).toBeNull();
  });

  it("sendChatMessage allows wish card only", () => {
    const base = startChat(
      { ...EMPTY, matchIntentId: "seed-bj-walk-1", stage: "published" },
      undefined,
      "zh-CN",
    );
    const next = sendChatMessage(base, "", {
      attachWishCard: true,
      wishIntentId: "seed-bj-walk-1",
    });
    expect(next.chatMessages).toHaveLength(1);
    expect(next.chatMessages[0]?.kind).toBe("wish_card");
  });
});
