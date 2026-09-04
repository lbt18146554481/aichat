import { describe, expect, it } from "vitest";
import {
  advanceSideWishQueue,
  canRetreatSideWishQueue,
  carrierFromSideState,
  retreatSideWishQueue,
} from "@/lib/side-queue";

describe("side-queue", () => {
  it("advances and retreats within ranked list", () => {
    const carrier = carrierFromSideState({
      rankedQueue: ["a", "b", "c"],
      queueCursor: 0,
      matchIntentId: "a",
      passedIntentIds: [],
      shownIntentIds: ["a"],
    });

    const next = advanceSideWishQueue(carrier, "see");
    expect(next.matchIntentId).toBe("b");
    expect(next.queueCursor).toBe(1);
    expect(canRetreatSideWishQueue(next)).toBe(true);

    const prev = retreatSideWishQueue(next);
    expect(prev.matchIntentId).toBe("a");
    expect(prev.queueCursor).toBe(0);
    expect(prev.atStart).toBe(false);
  });

  it("pass mode skips rejected ids when moving forward", () => {
    const carrier = carrierFromSideState({
      rankedQueue: ["a", "b", "c"],
      queueCursor: 0,
      matchIntentId: "a",
      passedIntentIds: [],
      shownIntentIds: ["a"],
    });
    const passed = advanceSideWishQueue(carrier, "pass");
    expect(passed.passedIntentIds).toContain("a");
    expect(passed.matchIntentId).toBe("b");
  });
});
