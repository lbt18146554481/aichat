import { describe, expect, it } from "vitest";
import { EMPTY, sessionNeedsBootStart, uid, type MatchmakerState } from "@/lib/agents/matchmaker";

function withHandoffMessages(
  after: Array<{ role: "user" | "assistant"; text: string; kind?: "handoff" }>,
): MatchmakerState {
  return {
    ...EMPTY,
    handoff: {
      from: "orchestrator",
      seed: "test",
      summary: "test",
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

describe("sessionNeedsBootStart", () => {
  it("starts empty sessions", () => {
    expect(sessionNeedsBootStart(EMPTY)).toBe(true);
  });

  it("does not restart normal sessions with messages", () => {
    const state: MatchmakerState = {
      ...EMPTY,
      messages: [{ id: "1", role: "user", t: 1, text: "hi" }],
    };
    expect(sessionNeedsBootStart(state)).toBe(false);
  });

  it("continues handoff only before first reply after divider", () => {
    const needs = withHandoffMessages([
      { role: "user", text: "想认识人" },
      { role: "assistant", text: "", kind: "handoff" },
    ]);
    expect(sessionNeedsBootStart(needs)).toBe(true);
  });

  it("does not restart handoff sessions already replied", () => {
    const done = withHandoffMessages([
      { role: "user", text: "想认识人" },
      { role: "assistant", text: "", kind: "handoff" },
      { role: "assistant", text: "好，你想认识什么样的人？" },
    ]);
    expect(sessionNeedsBootStart(done)).toBe(false);
  });
});
