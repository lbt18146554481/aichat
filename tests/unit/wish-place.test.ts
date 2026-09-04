import { describe, expect, it } from "vitest";
import {
  findPlaceInText,
  formatWishPlace,
  isPlaceFlexText,
  isPlaceOnlineText,
  isPlacePublishable,
  normalizeWishPlaceFromExtract,
  resolvePlaceOnline,
  resolvePlaceRaw,
} from "@/lib/wish-place";

describe("wish-place", () => {
  it("detects online vs flexible place phrases", () => {
    expect(isPlaceOnlineText("线上")).toBe(true);
    expect(isPlaceOnlineText("远程")).toBe(true);
    expect(isPlaceOnlineText("online")).toBe(true);
    expect(isPlaceFlexText("不限")).toBe(true);
    expect(isPlaceFlexText("线上")).toBe(false);
    expect(isPlaceFlexText("anywhere")).toBe(true);
    expect(isPlaceFlexText("上海")).toBe(false);
  });

  it("resolves placeOnline from placeRaw for back-compat", () => {
    expect(resolvePlaceOnline({ placeRaw: "线上" })).toBe(true);
    expect(resolvePlaceOnline({ placeFlex: true, placeRaw: "不限" })).toBe(false);
  });

  it("parses known cities from free text", () => {
    const place = findPlaceInText("上海静安");
    expect(place?.city).toBe("shanghai");
    expect(place?.country).toBe("cn");
  });

  it("rejects garbage place input", () => {
    expect(
      isPlacePublishable({ placeRaw: "!!!", placeFlex: false, place: null }),
    ).toBe(false);
    expect(
      isPlacePublishable({ placeRaw: "x", placeFlex: false, place: null }),
    ).toBe(false);
  });

  it("accepts flexible and online place", () => {
    expect(
      isPlacePublishable({ placeRaw: "不限", placeFlex: true, place: null }),
    ).toBe(true);
    expect(
      isPlacePublishable({ placeRaw: "线上", placeOnline: true, placeFlex: false, place: null }),
    ).toBe(true);
  });

  it("normalizes LLM extract json", () => {
    const out = normalizeWishPlaceFromExtract({
      placeFlex: false,
      country: "中国",
      city: "北京",
      detailLabel_zh: "朝阳公园",
    });
    expect(out.placeOnline).toBe(false);
    expect(out.placeFlex).toBe(false);
    expect(out.place?.country).toBe("cn");
    expect(out.place?.city).toBe("beijing");
    expect(out.place?.detail).toBe("朝阳公园");
  });

  it("normalizes online extract json", () => {
    const out = normalizeWishPlaceFromExtract({ placeOnline: true });
    expect(out.placeOnline).toBe(true);
    expect(out.placeFlex).toBe(false);
    expect(out.place).toBeNull();
  });

  it("formats wish place for display", () => {
    const place = findPlaceInText("北京");
    const line = formatWishPlace(place, "北京", false, "zh-CN");
    expect(line).toContain("北京");
    expect(formatWishPlace(null, "线上", false, "zh-CN", true)).toBe("线上");
    expect(formatWishPlace(null, "不限", true, "zh-CN")).toBe("地点不限");
  });

  it("resolves place raw with profile fallback", () => {
    expect(resolvePlaceRaw("", undefined, "上海")).toBe("上海");
    expect(resolvePlaceRaw("杭州", undefined, "上海")).toBe("杭州");
  });
});
