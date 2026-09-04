import { describe, expect, it } from "vitest";
import {
  assembleFromParsed,
  inferForcedTargetFromUser,
  type OrchestratorInput,
} from "@/lib/orchestrator-llm.server";
import { EMPTY_PROFILE } from "@/lib/profile-shape";

function input(partial: Partial<OrchestratorInput> & { userMessage: string }): OrchestratorInput {
  return {
    lang: "zh-CN",
    history: [],
    profile: { ...EMPTY_PROFILE },
    ...partial,
  };
}

describe("inferForcedTargetFromUser", () => {
  it("handoffs matchmaker as soon as user wants to meet someone", () => {
    expect(inferForcedTargetFromUser(input({ userMessage: "我想认识新人" }))).toBe("matchmaker");
    expect(inferForcedTargetFromUser(input({ userMessage: "找女生，20岁以下的" }))).toBe(
      "matchmaker",
    );
  });

  it("handoffs sidebyside for activity wishes", () => {
    expect(inferForcedTargetFromUser(input({ userMessage: "周末一起跑步" }))).toBe("sidebyside");
  });

  it("does not force on greetings or who-are-you", () => {
    expect(inferForcedTargetFromUser(input({ userMessage: "你好" }))).toBeNull();
    expect(inferForcedTargetFromUser(input({ userMessage: "你是谁" }))).toBeNull();
  });

  it("keeps prior exclusive lane on short affirmations", () => {
    expect(
      inferForcedTargetFromUser(
        input({
          history: [
            { role: "user", content: "我想认识新人" },
            { role: "assistant", content: "你希望找什么样的人？" },
            { role: "user", content: "找女生，20岁以下的" },
            { role: "assistant", content: "有没有共同兴趣？" },
          ],
          userMessage: "都行",
        }),
      ),
    ).toBe("matchmaker");
  });

  it("prefers sidebyside when both person and activity signals appear", () => {
    expect(inferForcedTargetFromUser(input({ userMessage: "我想找人一起逛公园" }))).toBe(
      "sidebyside",
    );
  });

  it("ignores assistant copy that mentions both lanes", () => {
    expect(
      inferForcedTargetFromUser(
        input({
          history: [
            {
              role: "assistant",
              content: "你是想认识新朋友，还是想找人一起做点事情？",
            },
          ],
          userMessage: "你好呀",
        }),
      ),
    ).toBeNull();
  });
});

describe("assembleFromParsed", () => {
  it("overrides model clarify when user already chose meet-someone", () => {
    const result = assembleFromParsed(input({ userMessage: "我想认识新人" }), {
      action: "clarify",
      target: null,
      confidence: 0.4,
      reply: "你希望找什么样的人？",
      summary: "",
    });
    expect(result.action).toBe("handoff");
    expect(result.target).toBe("matchmaker");
  });

  it("promotes model target when action left as clarify", () => {
    const result = assembleFromParsed(input({ userMessage: "嗯……" }), {
      action: "clarify",
      target: "sidebyside",
      confidence: 0.7,
      reply: "好，那我们开始找搭子。",
    });
    expect(result.action).toBe("handoff");
    expect(result.target).toBe("sidebyside");
  });
});
