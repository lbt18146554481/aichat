import { describe, expect, it } from "vitest";
import { isZh, normalizeLang, pickLocaleText, syncUiLang } from "@/lib/lang";
import { displayZh, toTraditional } from "@/lib/zh-hant";

describe("traditional Chinese locale", () => {
  it("converts simplified copy and keeps simplified locales unchanged", () => {
    expect(toTraditional("发心愿")).toBe("發心願");
    expect(displayZh("zh-Hant", "报名")).toBe("報名");
    expect(displayZh("zh-CN", "报名")).toBe("报名");
    expect(displayZh("en", "报名")).toBe("报名");
  });

  it("still treats traditional UI as Chinese for stored fields", () => {
    expect(isZh("zh-Hant")).toBe(true);
    expect(normalizeLang("zh-Hant")).toBe("zh-CN");
    expect(pickLocaleText("zh-Hant", "Join", "报名")).toBe("報名");
    expect(pickLocaleText("en", "Join", "报名")).toBe("Join");
  });

  it("follows the homepage language even when callers pass simplified Chinese", () => {
    syncUiLang("zh-Hant");
    expect(pickLocaleText("zh-CN", "Join", "报名")).toBe("報名");
    syncUiLang("en");
    expect(pickLocaleText("zh-CN", "Join", "报名")).toBe("报名");
  });
});
