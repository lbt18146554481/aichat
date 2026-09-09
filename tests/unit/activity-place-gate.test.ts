import { describe, expect, it } from "vitest";
import { hasPlaceForActivitySearch } from "@/lib/wish-place";
import { emptyWishDraft } from "@/lib/wish-types";
import { ACTIVITY_PLACE_FIELD_KEY, buildActivityPlaceAsk } from "@/lib/ask-user-info";

describe("hasPlaceForActivitySearch", () => {
  it("rejects empty draft", () => {
    expect(hasPlaceForActivitySearch(emptyWishDraft(), { cities: [] })).toBe(false);
  });

  it("accepts structured city", () => {
    expect(
      hasPlaceForActivitySearch(
        { ...emptyWishDraft(), placeMode: "offline", place: { city: "shanghai" } },
        { cities: [] },
      ),
    ).toBe(true);
  });

  it("accepts explicit anywhere / online via placeRaw", () => {
    expect(
      hasPlaceForActivitySearch({ ...emptyWishDraft(), placeRaw: "地点不限" }, { cities: [] }),
    ).toBe(true);
    expect(
      hasPlaceForActivitySearch({ ...emptyWishDraft(), placeRaw: "online" }, { cities: [] }),
    ).toBe(true);
  });

  it("accepts hard filter cities", () => {
    expect(hasPlaceForActivitySearch(emptyWishDraft(), { cities: ["Beijing"] })).toBe(true);
  });
});

describe("buildActivityPlaceAsk", () => {
  it("uses activity_place field key", () => {
    const ask = buildActivityPlaceAsk("zh-CN");
    expect(ask.fieldKey).toBe(ACTIVITY_PLACE_FIELD_KEY);
    expect(ask.kind).toBe("text");
    expect(ask.prompt).toContain("地点");
  });
});
