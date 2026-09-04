import { describe, expect, it } from "vitest";
import { isAgentFirstReply } from "@/lib/agent-voice";

describe("isAgentFirstReply", () => {
  it("true when no assistant messages yet", () => {
    expect(
      isAgentFirstReply([
        { role: "user", content: "我想认识新朋友" },
        { role: "user", content: "女生，话多一点" },
      ]),
    ).toBe(true);
  });

  it("false after assistant spoke", () => {
    expect(
      isAgentFirstReply([
        { role: "user", content: "hi" },
        { role: "assistant", content: "你好" },
      ]),
    ).toBe(false);
  });
});
