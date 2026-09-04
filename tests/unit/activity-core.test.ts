import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CORE_HARD_THRESHOLD,
  activityCoreFromKind,
  activityCoreMatchScore,
  activityCoreSimilarity,
  kindFromActivityCore,
  passesActivityCoreHardFilter,
  resolveActivityCoreText,
} from "@/lib/activity-core";
import { publishMyIntent } from "@/lib/intents";

describe("activity-core", () => {
  it("maps kind ↔ core", () => {
    expect(activityCoreFromKind("run")).toBe("跑步");
    expect(kindFromActivityCore("夜跑")).toBe("run");
    expect(kindFromActivityCore("轻松读书")).toBe("other");
  });

  it("prefers explicit activityCore over kind", () => {
    expect(
      resolveActivityCoreText({
        activityCore: "羽毛球",
        kind: "run",
        rawText: "周末朝阳公园跑步",
      }),
    ).toBe("羽毛球");
  });

  it("hard filter drops low-similarity cores", () => {
    const mine = publishMyIntent({
      kind: "run",
      activityCore: "跑步",
      activityStrength: "hard",
      rawText: "必须跑步",
      city: "Beijing",
      skipRemotePersist: true,
    });
    const tennis = publishMyIntent({
      kind: "tennis",
      activityCore: "网球",
      rawText: "打球",
      city: "Beijing",
      skipRemotePersist: true,
    });
    const run = publishMyIntent({
      kind: "run",
      activityCore: "慢跑",
      rawText: "慢跑",
      city: "Beijing",
      skipRemotePersist: true,
    });
    expect(passesActivityCoreHardFilter(mine, tennis)).toBe(false);
    expect(passesActivityCoreHardFilter(mine, run)).toBe(true);
    expect(activityCoreSimilarity("跑步", "慢跑")).toBeGreaterThanOrEqual(
      ACTIVITY_CORE_HARD_THRESHOLD,
    );
  });

  it("flex scores without hard drop", () => {
    const mine = publishMyIntent({
      kind: "run",
      activityCore: "跑步",
      activityStrength: "flex",
      rawText: "想跑步",
      city: "Beijing",
      skipRemotePersist: true,
    });
    const tennis = publishMyIntent({
      kind: "tennis",
      activityCore: "网球",
      rawText: "网球",
      city: "Beijing",
      skipRemotePersist: true,
    });
    expect(passesActivityCoreHardFilter(mine, tennis)).toBe(true);
    expect(activityCoreMatchScore(mine, tennis)).toBeLessThan(
      activityCoreMatchScore(
        mine,
        publishMyIntent({
          kind: "run",
          activityCore: "跑步",
          rawText: "跑步",
          city: "Beijing",
          skipRemotePersist: true,
        }),
      ),
    );
  });
});
