import { describe, expect, it } from "vitest";
import {
  citiesFromPlaceFields,
  findPlaceInText,
  formatWishPlace,
  isPlaceFlexText,
  isPlaceOnlineText,
  isPlacePublishable,
  normalizePlaceSpec,
  normalizeWishPlaceFromExtract,
  passesPlaceGeoHardFilter,
  passesPlaceModeHardFilter,
  placeDetailSoftScore,
  PLACE_ANY,
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
    expect(normalizePlaceSpec({ placeFlex: true }).place?.city).toBe(PLACE_ANY);
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
      isPlacePublishable({
        placeRaw: "线上",
        placeMode: "online",
        placeOnline: true,
        placeFlex: false,
        place: null,
      }),
    ).toBe(true);
  });

  it("normalizes LLM extract json with levels and any", () => {
    const out = normalizeWishPlaceFromExtract({
      placeMode: "offline",
      country: "中国",
      city: "北京",
      detailLabel_zh: "朝阳公园",
    });
    expect(out.placeMode).toBe("offline");
    expect(out.placeOnline).toBe(false);
    expect(out.place?.country).toBe("cn");
    expect(out.place?.city).toBe("beijing");
    expect(out.place?.detail).toBe("朝阳公园");

    const flex = normalizeWishPlaceFromExtract({ city: "any" });
    expect(flex.place?.city).toBe(PLACE_ANY);
    expect(flex.placeFlex).toBe(true);
  });

  it("normalizes online extract json", () => {
    const out = normalizeWishPlaceFromExtract({ placeMode: "online" });
    expect(out.placeMode).toBe("online");
    expect(out.placeOnline).toBe(true);
    expect(out.place).toBeNull();
  });

  it("formats wish place for display", () => {
    const place = findPlaceInText("北京");
    const line = formatWishPlace({ place, placeRaw: "北京" }, "zh-CN");
    expect(line).toContain("北京");
    expect(formatWishPlace({ placeOnline: true, placeRaw: "线上" }, "zh-CN")).toBe("线上");
    expect(formatWishPlace({ placeFlex: true, placeRaw: "不限" }, "zh-CN")).toBe("地点不限");
    expect(formatWishPlace({ place: { city: PLACE_ANY } }, "zh-CN")).toBe("地点不限");
  });

  it("derives hardFilter cities from structured place", () => {
    expect(citiesFromPlaceFields({ place: { city: "beijing" } })).toEqual(["beijing"]);
    expect(citiesFromPlaceFields({ place: { city: PLACE_ANY } })).toEqual([]);
    expect(citiesFromPlaceFields({ placeMode: "online" })).toEqual([]);
  });

  it("hard-filters mode and levels; detail is soft", () => {
    expect(
      passesPlaceModeHardFilter({ placeMode: "online" }, { placeMode: "offline" }),
    ).toBe(false);
    expect(
      passesPlaceModeHardFilter({ placeMode: "online" }, { placeMode: "any" }),
    ).toBe(true);
    expect(
      passesPlaceGeoHardFilter(
        { place: { city: "beijing" } },
        { place: { city: PLACE_ANY } },
        true,
      ),
    ).toBe(true);
    expect(
      passesPlaceGeoHardFilter(
        { place: { city: "beijing", detail: "朝阳公园" } },
        { place: { city: "beijing", detail: "三里屯" } },
        true,
      ),
    ).toBe(true);
    expect(
      passesPlaceGeoHardFilter(
        { place: { city: "beijing" } },
        { place: { city: "shanghai" } },
        true,
      ),
    ).toBe(false);
    expect(
      placeDetailSoftScore(
        { place: { detail: "朝阳公园" } },
        { place: { detail: "朝阳公园" } },
      ),
    ).toBeGreaterThan(0);
  });

  it("resolves place raw with profile fallback", () => {
    expect(resolvePlaceRaw("", undefined, "上海")).toBe("上海");
    expect(resolvePlaceRaw("杭州", undefined, "上海")).toBe("杭州");
  });
});
