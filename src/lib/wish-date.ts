/**
 * Calendar dates and activity windows for Side by Side wishes.
 * Storage: dateStart/dateEnd (YYYY-MM-DD) + timeStart/timeEnd (HH:mm, Asia/Shanghai).
 */

import type { Intent, Weekday, WhenTier } from "./intents";
import type { SideLang, WishDraft } from "./wish-types";

export const WISH_TZ = "Asia/Shanghai";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface DateRange {
  start: string;
  end: string;
}

export function isIsoDate(s: string | undefined | null): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d!;
}

export function normalizeIsoDate(s: string | undefined | null): string | undefined {
  const t = (s ?? "").trim();
  return isIsoDate(t) ? t : undefined;
}

const TIME_HHMM = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** Normalize to HH:mm (24h). */
export function normalizeTimeHHmm(s: string | undefined | null): string | undefined {
  const t = (s ?? "").trim();
  const m = TIME_HHMM.exec(t);
  if (!m) return undefined;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function splitIsoDateParts(iso?: string): { y: string; m: string; d: string } {
  const n = normalizeIsoDate(iso);
  if (!n) return { y: "", m: "", d: "" };
  const [y, m, d] = n.split("-");
  return { y: y!, m: m!, d: d! };
}

export function splitTimeHHmm(time?: string): { h: string; m: string } {
  const n = normalizeTimeHHmm(time);
  if (!n) return { h: "", m: "" };
  const [h, m] = n.split(":");
  return { h: h!, m: m! };
}

export function composeIsoDateParts(y: string, m: string, d: string): string | undefined {
  if (y.length !== 4 || m.length !== 2 || d.length !== 2) return undefined;
  const iso = `${y}-${m}-${d}`;
  return isIsoDate(iso) ? iso : undefined;
}

export function composeTimeHHmm(h: string, m: string): string | undefined {
  if (h.length !== 2 || m.length !== 2) return undefined;
  return normalizeTimeHHmm(`${h}:${m}`);
}

export interface ActivityScheduleValue {
  dateStart?: string;
  timeStart?: string;
  timeEnd?: string;
}

export function formatActivityWindow(
  draft: Pick<WishDraft, "dateStart" | "dateEnd" | "timeStart" | "timeEnd" | "whenAny" | "when">,
  lang: SideLang,
): string {
  const date = normalizeIsoDate(draft.dateStart);
  const t0 = normalizeTimeHHmm(draft.timeStart);
  const t1 = normalizeTimeHHmm(draft.timeEnd);
  if (date && t0 && t1) {
    const [y, m, d] = date.split("-").map((x) => String(Number(x)));
    if (lang === "zh-CN") return `${y}/${m}/${d} ${t0}-${t1}`;
    return `${date} ${t0}-${t1}`;
  }
  if (date) {
    const end = normalizeIsoDate(draft.dateEnd) ?? date;
    return formatDateRangeLine({ start: date, end }, lang);
  }
  if (!draft.whenAny && draft.when) {
    const whenZh: Record<string, string> = {
      weekend: "周末",
      weeknight: "工作日晚上",
      any: "不限",
    };
    const whenEn: Record<string, string> = {
      weekend: "weekend",
      weeknight: "weeknight",
      any: "any time",
    };
    return lang === "zh-CN"
      ? `时间：${whenZh[draft.when] ?? draft.when}`
      : `when: ${whenEn[draft.when] ?? draft.when}`;
  }
  return lang === "zh-CN" ? "时间未定" : "time TBD";
}

function intentHasPreciseTimes(it: Intent): boolean {
  return Boolean(
    normalizeIsoDate(it.dateStart) &&
      normalizeTimeHHmm(it.timeStart) &&
      normalizeTimeHHmm(it.timeEnd),
  );
}

function toEpochMs(iso: string, time: string): number {
  return new Date(`${iso}T${time}:00+08:00`).getTime();
}

/** True when both sides have precise times and intervals overlap (same-day assumed). */
export function activityTimesOverlap(mine: Intent, other: Intent): boolean {
  if (!intentHasPreciseTimes(mine) || !intentHasPreciseTimes(other)) return true;
  const mDate = normalizeIsoDate(mine.dateStart)!;
  const oDate = normalizeIsoDate(other.dateStart)!;
  const mStart = toEpochMs(mDate, normalizeTimeHHmm(mine.timeStart)!);
  const mEnd = toEpochMs(normalizeIsoDate(mine.dateEnd) ?? mDate, normalizeTimeHHmm(mine.timeEnd)!);
  const oStart = toEpochMs(oDate, normalizeTimeHHmm(other.timeStart)!);
  const oEnd = toEpochMs(normalizeIsoDate(other.dateEnd) ?? oDate, normalizeTimeHHmm(other.timeEnd)!);
  return mStart < oEnd && oStart < mEnd;
}

/** Calendar date in Asia/Shanghai as YYYY-MM-DD. */
export function toIsoDate(d: Date, tz = WISH_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Weekday index 0=Sun … 6=Sat in timezone. */
export function weekdayIndex(d: Date, tz = WISH_TZ): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export function weekdayFromIso(iso: string): Weekday {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return WEEKDAY_ORDER[dt.getUTCDay()]!;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

export function formatNowContext(lang: SideLang, now = new Date(), tz = WISH_TZ): string {
  const iso = toIsoDate(now, tz);
  const zh = lang === "zh-CN";
  const weekdayZh = ["日", "一", "二", "三", "四", "五", "六"][weekdayIndex(now, tz)];
  const weekdayEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayIndex(now, tz)];
  const time = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return zh
    ? `当前日期时间：${iso}（星期${weekdayZh}）${time}，时区 ${tz}。相对日期请据此计算（如「这周末」「下周六」）。`
    : `Current date/time: ${iso} (${weekdayEn}) ${time}, timezone ${tz}. Resolve relative dates (this weekend, next Saturday, etc.) from this.`;
}

/** Upcoming Sat–Sun from `now` (if today is Sat/Sun, includes today through Sunday). */
export function thisWeekendRange(now = new Date(), tz = WISH_TZ): DateRange {
  const today = toIsoDate(now, tz);
  const dow = weekdayIndex(now, tz);
  if (dow === 6) return { start: today, end: addDaysIso(today, 1) };
  if (dow === 0) return { start: today, end: today };
  const daysUntilSat = 6 - dow;
  const sat = addDaysIso(today, daysUntilSat);
  return { start: sat, end: addDaysIso(sat, 1) };
}

/** Next Mon–Fri window from today. */
export function nextWeeknightRange(now = new Date(), tz = WISH_TZ): DateRange {
  const today = toIsoDate(now, tz);
  const dow = weekdayIndex(now, tz);
  if (dow >= 1 && dow <= 5) return { start: today, end: addDaysIso(today, 4 - dow) };
  const daysUntilMon = dow === 0 ? 1 : 8 - dow;
  const mon = addDaysIso(today, daysUntilMon);
  return { start: mon, end: addDaysIso(mon, 4) };
}

export function inferDatesFromWhen(
  when: WhenTier,
  now = new Date(),
  tz = WISH_TZ,
): Partial<DateRange> {
  if (when === "weekend") return thisWeekendRange(now, tz);
  if (when === "weeknight") return nextWeeknightRange(now, tz);
  return {};
}

/** Resolve calendar dates from draft fields; infer from when tier if needed. */
export function resolveDraftDates(
  draft: Pick<WishDraft, "dateStart" | "dateEnd" | "when" | "whenAny" | "timeStart" | "timeEnd">,
  now = new Date(),
): { dateStart?: string; dateEnd?: string; timeStart?: string; timeEnd?: string } {
  let dateStart =
    draft.dateStart !== undefined ? normalizeIsoDate(draft.dateStart) : undefined;
  let dateEnd = draft.dateEnd !== undefined ? normalizeIsoDate(draft.dateEnd) : undefined;
  if (!dateStart && !draft.whenAny && draft.when) {
    const inferred = inferDatesFromWhen(draft.when, now);
    dateStart = normalizeIsoDate(inferred.start);
    dateEnd = normalizeIsoDate(inferred.end) ?? dateStart;
  }
  if (dateStart && !dateEnd) dateEnd = dateStart;
  const timeStart = normalizeTimeHHmm(draft.timeStart);
  const timeEnd = normalizeTimeHHmm(draft.timeEnd);
  if (!dateStart) return timeStart && timeEnd ? { timeStart, timeEnd } : {};
  return {
    dateStart,
    dateEnd,
    ...(timeStart ? { timeStart } : {}),
    ...(timeEnd ? { timeEnd } : {}),
  };
}

export function intentDateRange(it: Intent): DateRange | null {
  const start = normalizeIsoDate(it.dateStart);
  if (!start) return null;
  const end = normalizeIsoDate(it.dateEnd) ?? start;
  return start <= end ? { start, end } : { start: end, end: start };
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function rangeIncludesWeekday(start: string, end: string, day: Weekday): boolean {
  let cur = start;
  while (cur <= end) {
    if (weekdayFromIso(cur) === day) return true;
    cur = addDaysIso(cur, 1);
  }
  return false;
}

/**
 * Date compatibility for recall.
 * - Mine without dates → no date hard filter.
 * - Other with dates → ranges must overlap.
 * - Other without dates → mine range must include other's recurring weekday (if set).
 */
export function datesCompatible(mine: Intent, other: Intent): boolean {
  const mineRange = intentDateRange(mine);
  if (!mineRange) return true;

  const otherRange = intentDateRange(other);
  let dayOk: boolean;
  if (otherRange) dayOk = rangesOverlap(mineRange, otherRange);
  else if (other.whenAny) dayOk = true;
  else dayOk = rangeIncludesWeekday(mineRange.start, mineRange.end, other.day);

  if (!dayOk) return false;
  return activityTimesOverlap(mine, other);
}

export function formatDateRangeLine(range: DateRange | null, lang: SideLang): string {
  if (!range) return lang === "zh-CN" ? "日期：未定" : "dates: any";
  if (range.start === range.end) return lang === "zh-CN" ? `日期：${range.start}` : `date: ${range.start}`;
  return lang === "zh-CN"
    ? `日期：${range.start} 至 ${range.end}`
    : `dates: ${range.start} – ${range.end}`;
}
