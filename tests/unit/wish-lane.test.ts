import { describe, expect, it } from "vitest";
import {
  canSwitchWishLane,
  detectWishLaneSwitch,
  inferWishLaneFromText,
  isOfferMatchAffirmation,
  isOfferMatchDecline,
  isVagueExploreWishSeed,
  isWishLaneSelectionMessage,
} from "@/lib/wish-lane";

describe("wish-lane", () => {
  it("infers browse vs publish", () => {
    expect(inferWishLaneFromText("有没有人在找徒步搭子")).toBe("browse");
    expect(inferWishLaneFromText("我想周末找人一起散步")).toBe("publish");
    expect(inferWishLaneFromText("你好")).toBeNull();
  });

  it("detects lane switch", () => {
    expect(detectWishLaneSwitch("还是先看看别人的", "publish")).toBe("browse");
    expect(detectWishLaneSwitch("还是我自己发一个吧", "browse")).toBe("publish");
  });

  it("gates lane switch when chatting", () => {
    expect(
      canSwitchWishLane({ wishLane: "browse", stage: "chat", myIntentId: null }),
    ).toBe(false);
    expect(
      canSwitchWishLane({ wishLane: "browse", stage: "prompt", myIntentId: null }),
    ).toBe(true);
  });

  it("does not switch browse to publish on buddy criteria", () => {
    expect(detectWishLaneSwitch("我想找跑步搭子", "browse")).toBeNull();
    expect(inferWishLaneFromText("我想找跑步搭子")).toBe("browse");
  });

  it("parses offer match replies", () => {
    expect(isOfferMatchAffirmation("好啊顺便找找")).toBe(true);
    expect(isOfferMatchDecline("不用了")).toBe(true);
  });

  it("detects lane-only selection messages", () => {
    expect(isWishLaneSelectionMessage("我想发布心愿")).toBe(true);
    expect(isWishLaneSelectionMessage("我想发布自己的活动心愿")).toBe(true);
    expect(isWishLaneSelectionMessage("我想先看看别人的")).toBe(true);
    expect(isWishLaneSelectionMessage("我想先看看别人的活动心愿")).toBe(true);
    expect(isWishLaneSelectionMessage("我想周末找人一起散步")).toBe(false);
  });

  it("flags vague explore handoff seeds", () => {
    expect(isVagueExploreWishSeed("我想探索一些有趣的活动")).toBe(true);
    expect(isVagueExploreWishSeed("周末一起徒步")).toBe(false);
    expect(isVagueExploreWishSeed("想约人周末徒步")).toBe(false);
  });

  it("does not infer browse from vague explore handoff seeds", () => {
    expect(inferWishLaneFromText("我想探索一些有趣的活动")).toBeNull();
  });

  it("treats combined publish lane + activity as publish intent", () => {
    expect(inferWishLaneFromText("我想发布心愿:这周末上午在北京朝阳公园跑步")).toBe("publish");
    expect(isWishLaneSelectionMessage("我想发布心愿:这周末上午在北京朝阳公园跑步")).toBe(false);
  });
});
