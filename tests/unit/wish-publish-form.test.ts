import { describe, expect, it } from "vitest";
import {
  parseWishPublishFormValue,
  WISH_PUBLISH_FORM_VERSION,
} from "@/components/wish-publish-form";

describe("wish-publish-form", () => {
  it("parses v2 payload", () => {
    const raw = JSON.stringify({
      v: WISH_PUBLISH_FORM_VERSION,
      draft: {
        kind: "other",
        activityDescRaw: "周末逛公园",
        rawText: "周末逛公园",
        buddyPrefRaw: "最好女生，话多一点",
        otherReqRaw: "希望准时",
        whenAny: false,
        when: "weekend",
        levelAny: true,
        city: "上海",
        city_zh: "上海",
      },
    });
    const parsed = parseWishPublishFormValue(raw);
    expect(parsed?.draft.activityDescRaw).toBe("周末逛公园");
    expect(parsed?.draft.buddyPrefRaw).toBe("最好女生，话多一点");
    expect(parsed?.draft.otherReqRaw).toBe("希望准时");
  });

  it("migrates v1 payload", () => {
    const raw = JSON.stringify({
      v: 1,
      draft: { kind: "other", rawText: "跑步", whenAny: true, levelAny: true },
      otherNotes: "别迟到",
    });
    const parsed = parseWishPublishFormValue(raw);
    expect(parsed?.draft.otherReqRaw).toBe("别迟到");
  });

  it("rejects invalid payload", () => {
    expect(parseWishPublishFormValue("not json")).toBeNull();
    expect(parseWishPublishFormValue(JSON.stringify({ v: 99 }))).toBeNull();
  });
});
