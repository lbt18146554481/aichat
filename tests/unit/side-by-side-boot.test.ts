import { describe, expect, it } from "vitest";
import { EMPTY, sessionNeedsBootStart, uid, type SideState } from "@/lib/agents/side-by-side";

function withHandoffMessages(
  after: Array<{ role: "user" | "assistant"; text: string; kind?: "handoff" }>,
): SideState {
  return {
    ...EMPTY,
    handoff: {
      from: "orchestrator",
      seed: "我想探索一些有趣的活动",
      summary: "想找搭子一起做事",
      graftedMessages: [],
      handoffCount: 0,
    },
    messages: after.map((m, i) => ({
      id: uid() + i,
      role: m.role,
      t: i,
      text: m.text,
      kind: m.kind,
    })),
  };
}

describe("side sessionNeedsBootStart", () => {
  it("starts empty sessions", () => {
    expect(sessionNeedsBootStart(EMPTY)).toBe(true);
  });

  it("does not restart normal sessions with messages", () => {
    const state: SideState = {
      ...EMPTY,
      messages: [{ id: "1", role: "user", t: 1, text: "周末一起跑步" }],
    };
    expect(sessionNeedsBootStart(state)).toBe(false);
  });

  it("continues handoff only before first reply after divider", () => {
    const needs = withHandoffMessages([
      { role: "user", text: "我想探索一些有趣的活动" },
      { role: "assistant", text: "", kind: "handoff" },
    ]);
    expect(sessionNeedsBootStart(needs)).toBe(true);
  });

  it("does not restart handoff sessions already replied", () => {
    const done = withHandoffMessages([
      { role: "user", text: "我想探索一些有趣的活动" },
      { role: "assistant", text: "", kind: "handoff" },
      { role: "assistant", text: "好呀，你想一起做什么？" },
    ]);
    expect(sessionNeedsBootStart(done)).toBe(false);
  });
});
