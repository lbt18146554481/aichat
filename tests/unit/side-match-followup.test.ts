import { describe, expect, it } from "vitest";
import {
  runSideMatchIntroReply,
  runSideMatchFollowUp,
} from "@/lib/side-match-followup-llm.server";

describe("side-match-intro", () => {
  it("exposes single-beat intro helper (and follow-up alias)", () => {
    expect(typeof runSideMatchIntroReply).toBe("function");
    expect(runSideMatchFollowUp).toBe(runSideMatchIntroReply);
  });
});
