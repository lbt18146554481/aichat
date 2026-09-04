import { describe, expect, it } from "vitest";
import { splitHistoryByRounds } from "@/lib/handoff-detect.server";

describe("splitHistoryByRounds", () => {
  it("keeps all messages when fewer than 6 user turns", () => {
    const history = [
      { role: "user" as const, content: "a" },
      { role: "assistant" as const, content: "1" },
      { role: "user" as const, content: "b" },
    ];
    const { earlier, recent } = splitHistoryByRounds(history, 6);
    expect(earlier).toEqual([]);
    expect(recent).toEqual(history);
  });

  it("splits so recent includes the last 6 user turns", () => {
    const history = Array.from({ length: 8 }, (_, i) => [
      { role: "user" as const, content: `u${i}` },
      { role: "assistant" as const, content: `a${i}` },
    ]).flat();
    const { earlier, recent } = splitHistoryByRounds(history, 6);
    expect(earlier.map((m) => m.content)).toEqual(["u0", "a0", "u1", "a1"]);
    expect(recent[0]?.content).toBe("u2");
    expect(recent.filter((m) => m.role === "user")).toHaveLength(6);
  });
});
