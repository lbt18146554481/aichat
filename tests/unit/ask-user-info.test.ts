import { describe, expect, it } from "vitest";
import {
  formatUserAskResolutionForLlm,
  parseAskUserInfoArgs,
  resolutionFromCardValue,
  skippedUserAskResolution,
  toAgentAsk,
} from "@/lib/ask-user-info";

describe("ask-user-info", () => {
  it("parses text ask args", () => {
    const ask = parseAskUserInfoArgs(
      {
        fieldKey: "preferred_city",
        prompt: "你想在哪个城市找人？",
        kind: "text",
        placeholder: "例如：上海",
      },
      "call_1",
    );
    expect(ask).toMatchObject({
      toolCallId: "call_1",
      fieldKey: "preferred_city",
      kind: "text",
      prompt: "你想在哪个城市找人？",
    });
    expect(ask?.id.startsWith("user-info-")).toBe(true);
  });

  it("rejects select without options", () => {
    expect(
      parseAskUserInfoArgs({
        fieldKey: "gender",
        prompt: "性别？",
        kind: "select",
      }),
    ).toBeNull();
  });

  it("maps to AgentAsk and resolutions", () => {
    const pending = parseAskUserInfoArgs({
      fieldKey: "city",
      prompt: "城市？",
      kind: "text",
    })!;
    const agentAsk = toAgentAsk(pending, {
      confirmLabel: "继续",
      cancelLabel: "取消",
    });
    expect(agentAsk.kind).toBe("text");
    expect(agentAsk.id).toBe(pending.id);

    expect(resolutionFromCardValue(pending, "上海")).toEqual({
      status: "confirmed",
      value: "上海",
      fieldKey: "city",
      prompt: "城市？",
    });
    expect(resolutionFromCardValue(pending, null).status).toBe("cancelled");
    expect(skippedUserAskResolution(pending).status).toBe("skipped");
  });

  it("formats empty results for the LLM", () => {
    const note = formatUserAskResolutionForLlm(
      { status: "skipped", value: null, fieldKey: "city", prompt: "城市？" },
      "zh-CN",
    );
    expect(note).toContain("status=skipped");
    expect(note).toContain('value=""');
  });
});
