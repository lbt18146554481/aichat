import type { Intent } from "./intents";
import { slotToWhen } from "./intents";
import type { SideLang } from "./wish-types";
import { formatActivityWindow } from "./wish-date";
import { formatWishPlace, resolvePlaceOnline } from "./wish-place";
import { pickLocaleText } from "./lang";

export interface WishContentLines {
  time: string;
  place: string;
  activity: string;
  buddyPref: string;
}

export function formatWishContentLines(intent: Intent, lang: SideLang): WishContentLines {
  const when = intent.whenAny ? undefined : slotToWhen(intent.day, intent.window);
  const time = formatActivityWindow(
    {
      dateStart: intent.dateStart,
      dateEnd: intent.dateEnd,
      timeStart: intent.timeStart,
      timeEnd: intent.timeEnd,
      whenAny: intent.whenAny,
      when,
    },
    lang,
  );

  const placeRaw =
    intent.placeRaw?.trim() ||
    pickLocaleText(lang, intent.city || intent.ownerCity, intent.city_zh || intent.ownerCity_zh);
  const place = formatWishPlace(
    intent.place ?? null,
    placeRaw,
    intent.placeFlex ?? false,
    lang,
    resolvePlaceOnline(intent),
  );

  const activity =
    (lang === "zh-CN"
      ? intent.activityDescRaw || intent.rawText_zh || intent.rawText
      : intent.activityDescRaw || intent.rawText) || "";

  const buddyRaw = intent.buddyPrefRaw?.trim();
  const buddyPref =
    buddyRaw ||
    (lang === "zh-CN" ? "不限" : "No preference");

  return { time, place, activity, buddyPref };
}

export function defaultMatchReason(
  lang: SideLang,
  opts?: { crossCity?: boolean; quality?: string; placeOnline?: boolean },
): string {
  if (lang === "zh-CN") {
    if (opts?.placeOnline) return "都是线上活动，时间对得上就能聊。";
    if (opts?.crossCity) return "活动类型对得上，你们在异地，见面前记得确认地点。";
    if (opts?.quality === "relaxed-when") return "时间没完全重合，但活动和其他条件比较接近。";
    if (opts?.quality === "relaxed-level") return "水平差一档，但活动和时间对得上。";
    return "活动类型和时间都比较接近，值得聊一聊。";
  }
  if (opts?.placeOnline) return "Both online — timing lines up, worth a chat.";
  if (opts?.crossCity) return "Same activity — different cities; confirm location before you meet.";
  if (opts?.quality === "relaxed-when") return "Timing is close, not exact; activity still lines up.";
  if (opts?.quality === "relaxed-level") return "Skill level is a step off, but the activity and time work.";
  return "Your activity and timing line up well — worth a chat.";
}
