import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  activityTimesOverlap,
  composeIsoDateParts,
  composeTimeHHmm,
  datesCompatible,
  formatActivityWindow,
  formatNowContext,
  inferDatesFromWhen,
  isIsoDate,
  normalizeIsoDate,
  normalizeTimeHHmm,
  rangesOverlap,
  resolveDraftDates,
  thisWeekendRange,
  toIsoDate,
  weekdayIndex,
} from "@/lib/wish-date";
import type { Intent } from "@/lib/intents";

const TZ = "Asia/Shanghai";

function shDate(iso: string, hour = 12): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+08:00`);
}

describe("wish-date", () => {
  it("validates and normalizes ISO dates", () => {
    expect(isIsoDate("2026-03-07")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(normalizeIsoDate(" 2026-03-07 ")).toBe("2026-03-07");
    expect(normalizeIsoDate("bad")).toBeUndefined();
  });

  it("computes this weekend from a Wednesday", () => {
    const wed = shDate("2026-03-04", 10);
    expect(weekdayIndex(wed, TZ)).toBe(3);
    const range = thisWeekendRange(wed, TZ);
    expect(range.start).toBe("2026-03-07");
    expect(range.end).toBe("2026-03-08");
  });

  it("includes today when already Saturday", () => {
    const sat = shDate("2026-03-07", 9);
    const range = thisWeekendRange(sat, TZ);
    expect(range.start).toBe("2026-03-07");
    expect(range.end).toBe("2026-03-08");
  });

  it("infers weekend dates from when tier", () => {
    const wed = shDate("2026-03-04");
    const inferred = inferDatesFromWhen("weekend", wed, TZ);
    expect(inferred.start).toBe("2026-03-07");
    expect(inferred.end).toBe("2026-03-08");
  });

  it("resolveDraftDates prefers explicit dates then infers from when", () => {
    expect(
      resolveDraftDates(
        { whenAny: false, when: "weekend", dateStart: "2026-04-01", dateEnd: "2026-04-02" },
        shDate("2026-03-04"),
      ),
    ).toEqual({ dateStart: "2026-04-01", dateEnd: "2026-04-02" });

    expect(
      resolveDraftDates({ whenAny: false, when: "weekend" }, shDate("2026-03-04")),
    ).toEqual({ dateStart: "2026-03-07", dateEnd: "2026-03-08" });
  });

  it("formatNowContext includes calendar date", () => {
    const line = formatNowContext("zh-CN", shDate("2026-03-04", 15), TZ);
    expect(line).toContain("2026-03-04");
    expect(line).toContain("Asia/Shanghai");
  });

  it("datesCompatible requires overlapping ranges when mine has dates", () => {
    const mine = {
      dateStart: "2026-03-07",
      dateEnd: "2026-03-08",
      whenAny: false,
      day: "sat",
    } as Intent;
    const overlap = {
      dateStart: "2026-03-08",
      dateEnd: "2026-03-08",
      whenAny: true,
      day: "sun",
    } as Intent;
    const miss = {
      dateStart: "2026-03-14",
      dateEnd: "2026-03-15",
      whenAny: true,
      day: "sat",
    } as Intent;
    expect(datesCompatible(mine, overlap)).toBe(true);
    expect(datesCompatible(mine, miss)).toBe(false);
  });

  it("rangesOverlap is symmetric", () => {
    expect(
      rangesOverlap(
        { start: "2026-03-07", end: "2026-03-08" },
        { start: "2026-03-08", end: "2026-03-09" },
      ),
    ).toBe(true);
    expect(addDaysIso("2026-03-07", 1)).toBe("2026-03-08");
    expect(toIsoDate(shDate("2026-03-07"), TZ)).toBe("2026-03-07");
  });

  it("normalizes and composes schedule parts", () => {
    expect(normalizeTimeHHmm("12:00")).toBe("12:00");
    expect(normalizeTimeHHmm("9:5")).toBeUndefined();
    expect(composeIsoDateParts("2026", "06", "01")).toBe("2026-06-01");
    expect(composeTimeHHmm("12", "00")).toBe("12:00");
  });

  it("formats activity window for display", () => {
    expect(
      formatActivityWindow(
        {
          dateStart: "2026-06-01",
          timeStart: "12:00",
          timeEnd: "16:00",
          whenAny: false,
        },
        "zh-CN",
      ),
    ).toBe("2026/6/1 12:00-16:00");
  });

  it("activityTimesOverlap checks precise intervals", () => {
    const a = {
      dateStart: "2026-06-01",
      dateEnd: "2026-06-01",
      timeStart: "12:00",
      timeEnd: "14:00",
    } as Intent;
    const overlap = {
      dateStart: "2026-06-01",
      dateEnd: "2026-06-01",
      timeStart: "13:00",
      timeEnd: "15:00",
    } as Intent;
    const miss = {
      dateStart: "2026-06-01",
      dateEnd: "2026-06-01",
      timeStart: "15:00",
      timeEnd: "16:00",
    } as Intent;
    expect(activityTimesOverlap(a, overlap)).toBe(true);
    expect(activityTimesOverlap(a, miss)).toBe(false);
    expect(datesCompatible(a, miss)).toBe(false);
  });
});
