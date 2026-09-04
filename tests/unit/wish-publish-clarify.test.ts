import { describe, expect, it } from "vitest";
import {
  assessWishPublishClarifyProgress,
  buildPublishConfirmRecap,
  isPublishFormAcknowledgement,
  publishReplyStillClarifying,
  resolvePublishFormOpen,
  resolvePublishPendingConfirm,
} from "@/lib/wish-publish-clarify";
import { EMPTY_WISH_HARD_FILTERS, emptyWishDraft } from "@/lib/wish-types";
import { EMPTY_PROFILE } from "@/lib/profile-shape";

describe("wish-publish-clarify", () => {
  it("starts with open intake on empty draft", () => {
    const progress = assessWishPublishClarifyProgress({
      draft: emptyWishDraft(),
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      understanding: { positive: [], negative: [], notes: [] },
      profile: { ...EMPTY_PROFILE, city: "北京" },
      history: [],
    });
    expect(progress.focus).toBe("intake");
    expect(progress.intakeDone).toBe(false);
  });

  it("tracks four publish dimensions after intake", () => {
    const progress = assessWishPublishClarifyProgress({
      draft: {
        ...emptyWishDraft("周末想找人一起跑步"),
        kind: "run",
        when: "weekend",
        whenAny: false,
        city: "北京",
      },
      hardFilters: { ...EMPTY_WISH_HARD_FILTERS, cities: ["北京"] },
      understanding: { positive: [], negative: [], notes: ["希望水平差不多"] },
      profile: { ...EMPTY_PROFILE, city: "北京" },
      history: [
        { role: "user", content: "周末想找人一起跑步，北京朝阳公园，水平差不多" },
      ],
    });
    expect(progress.event).toBe("done");
    expect(progress.time).toBe("done");
    expect(progress.place).toBe("done");
    expect(progress.extra).toBe("done");
    expect(progress.focus).toBe("confirm");
  });

  it("does not treat bare 城市 as place collected", () => {
    const progress = assessWishPublishClarifyProgress({
      draft: {
        ...emptyWishDraft("这周末爬山"),
        kind: "climb",
        when: "weekend",
        whenAny: false,
      },
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      understanding: { positive: [], negative: [], notes: [] },
      profile: { ...EMPTY_PROFILE, city: "" },
      history: [
        { role: "user", content: "爬山" },
        { role: "user", content: "这周末" },
        { role: "user", content: "城市" },
      ],
    });
    expect(progress.place).toBe("missing");
    expect(progress.focus).toBe("place");
  });

  it("city name counts as place for publish prefill", () => {
    const progress = assessWishPublishClarifyProgress({
      draft: {
        ...emptyWishDraft("这周末在北京跑步"),
        kind: "run",
        when: "weekend",
        whenAny: false,
      },
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      understanding: { positive: [], negative: [], notes: [] },
      profile: { ...EMPTY_PROFILE, city: "北京" },
      history: [
        { role: "user", content: "我想这周末在北京跑步" },
        { role: "user", content: "最好是早上，水平不限" },
      ],
    });
    expect(progress.place).toBe("done");
    expect(progress.focus).toBe("confirm");
  });

  it("detects short ack while publish form is open", () => {
    expect(isPublishFormAcknowledgement("好的")).toBe(true);
    expect(isPublishFormAcknowledgement("OK")).toBe(true);
    expect(isPublishFormAcknowledgement("可以")).toBe(true);
    expect(isPublishFormAcknowledgement("我再改一点")).toBe(false);
    expect(isPublishFormAcknowledgement("想补充地点")).toBe(false);
  });

  it("opens form from LLM confirmLine or structural readiness", () => {
    expect(resolvePublishPendingConfirm({ confirmLine: null })).toBeNull();
    expect(
      resolvePublishPendingConfirm({ confirmLine: "这周末朝阳公园跑步，确认发布？" }),
    ).toBe("这周末朝阳公园跑步，确认发布？");
    expect(
      resolvePublishPendingConfirm({
        confirmLine: "ignored",
        existing: "already open",
      }),
    ).toBe("already open");

    const draft = {
      ...emptyWishDraft("这周末北京爬山"),
      kind: "run" as const,
      when: "weekend" as const,
      whenAny: false,
      city: "北京",
    };
    const progress = assessWishPublishClarifyProgress({
      draft,
      hardFilters: { ...EMPTY_WISH_HARD_FILTERS, cities: ["北京"] },
      understanding: { positive: [], negative: [], notes: [] },
      profile: { ...EMPTY_PROFILE, city: "北京" },
      history: [
        { role: "user", content: "这周末找人爬山" },
        { role: "user", content: "在北京，时间在周末都行，搭子没要求" },
      ],
    });
    expect(
      resolvePublishFormOpen({
        confirmLine: null,
        reply: "信息齐了，请检查右侧表单并点发布。",
        lang: "zh-CN",
        draft,
        hardFilters: { ...EMPTY_WISH_HARD_FILTERS, cities: ["北京"] },
        readyToPublish: false,
        publishProgress: progress,
      }),
    ).toBeTruthy();
  });

  it("builds publish confirm recap from draft", () => {
    const line = buildPublishConfirmRecap(
      "zh-CN",
      {
        ...emptyWishDraft("想约人周末徒步"),
        kind: "run",
        dateStart: "2026-06-01",
        timeStart: "12:00",
        timeEnd: "16:00",
        whenAny: false,
      },
      EMPTY_WISH_HARD_FILTERS,
    );
    expect(line).toContain("2026/6/1");
    expect(line).toContain("12:00-16:00");
  });

  it("marks extra done when user says no buddy preference", () => {
    const draft = {
      ...emptyWishDraft("这周末上午在北京朝阳公园跑步"),
      kind: "run" as const,
      when: "weekend" as const,
      whenAny: false,
      city: "北京",
      timeStart: "08:00",
      timeEnd: "12:00",
    };
    const progress = assessWishPublishClarifyProgress({
      draft,
      hardFilters: { ...EMPTY_WISH_HARD_FILTERS, cities: ["北京"] },
      understanding: { positive: [], negative: [], notes: [] },
      profile: { ...EMPTY_PROFILE, city: "北京" },
      history: [
        { role: "user", content: "我想发布心愿:这周末上午在北京朝阳公园跑步" },
        { role: "assistant", content: "还有什么补充吗？" },
        { role: "user", content: "对搭子没有要求" },
      ],
    });
    expect(progress.extra).toBe("done");
    expect(progress.focus).toBe("confirm");
  });

  it("blocks form when assistant reply still asks for place", () => {
    expect(
      publishReplyStillClarifying(
        "收到。这周末早上在北京跑步，水平不限。那活动地点有具体偏好吗？比如在哪个区、哪条线路或公园？",
        "zh-CN",
      ),
    ).toBe(true);
  });
});
