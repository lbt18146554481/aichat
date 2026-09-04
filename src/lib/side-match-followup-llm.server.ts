import { getIntentById, type Intent, type MatchQuality } from "./intents";
import { chatCompletionJson, chatCompletionJsonStream } from "./llm.server";
import { selfVoiceRule } from "./agent-voice";
import type { WishLane } from "./wish-lane";
import type { SideLang } from "./wish-types";

interface FollowupJson {
  reply?: string;
}

function zh(lang: SideLang): boolean {
  return lang === "zh-CN";
}

function isBrowse(lane?: WishLane): boolean {
  return lane === "browse";
}

function introFallback(
  other: Intent,
  matchReason: string | undefined,
  crossCity: boolean,
  lang: SideLang,
): string {
  const name = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const wish = lang === "zh-CN" ? other.rawText_zh || other.rawText : other.rawText;
  if (lang === "zh-CN") {
    const cross = crossCity ? "同城暂时没有，这位来自其他城市。" : "";
    const why = matchReason?.trim() ? `我觉得可能合适是因为：${matchReason.trim()}` : "活动时间和类型都比较接近。";
    return `池子里有一位 ${name} 也挂了类似的心愿：${wish}。${why}${cross ? ` ${cross}` : ""} 详情在右边，看看要不要聊聊？`;
  }
  const cross = crossCity ? "No same-city match — they're in another city. " : "";
  const why = matchReason?.trim() ? `Why: ${matchReason.trim()}` : "Your timing and activity line up.";
  return `${cross}${name} has a similar wish in the pool: ${wish}. ${why} Details on the right — want to say hi?`;
}

function emptyFallback(
  rawWish: string,
  lang: SideLang,
  wishLane?: WishLane,
): string {
  if (lang === "zh-CN") {
    if (isBrowse(wishLane)) {
      return rawWish
        ? `按现在的搜索条件（${rawWish}），池子里暂时还没有合适的活动心愿。要不要放宽时间或活动类型，或者改发一条自己的心愿？`
        : `按现在的条件，池子里暂时还没有合适的活动心愿。要不要放宽时间或活动类型试试？`;
    }
    return rawWish
      ? `心愿已经记下了：${rawWish}。不过按现在的条件，暂时还没有合适的人。要不要放宽时间或活动类型试试？`
      : `按现在的条件，暂时还没有合适的人。要不要放宽时间或活动类型试试？`;
  }
  if (isBrowse(wishLane)) {
    return rawWish
      ? `With your search filters (${rawWish}), I don't see a good wish in the pool yet. Want to loosen when or activity, or post your own wish?`
      : `No matching wish in the pool with your current filters yet. Want to loosen when or activity type?`;
  }
  return rawWish
    ? `Your wish is saved (${rawWish}), but I don't have a good match yet. Want to loosen when or activity type?`
    : `No good match with your current filters yet. Want to loosen when or activity type?`;
}

function useTemplateIntro(
  crossCityMatch: boolean,
  matchQuality?: MatchQuality,
): boolean {
  return crossCityMatch || (matchQuality != null && matchQuality !== "exact");
}

async function streamFollowup(
  system: string,
  user: string,
  fallback: string,
  onDelta?: (text: string) => void,
): Promise<string> {
  let value: FollowupJson | null = null;
  for await (const ev of chatCompletionJsonStream<FollowupJson>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.75, maxTokens: 450 },
  )) {
    if (ev.type === "delta") onDelta?.(ev.text);
    else if (ev.type === "done") value = ev.value;
  }
  const reply = value?.reply?.trim();
  if (reply) return reply;

  const parsed = await chatCompletionJson<FollowupJson>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.75, maxTokens: 450 },
  );
  return parsed?.reply?.trim() || fallback;
}

/** Second beat after server recall — introduce match or explain empty pool. */
export async function runSideMatchFollowUp(opts: {
  lang: SideLang;
  wishLane?: WishLane;
  mine: Intent;
  otherId: string | null;
  recallEmpty: boolean;
  matchReason?: string;
  matchQuality?: MatchQuality;
  crossCityMatch: boolean;
  relaxHints: string[];
  onDelta?: (text: string) => void;
}): Promise<string> {
  const isZh = zh(opts.lang);
  const rawWish = opts.mine.rawText_zh?.trim() || opts.mine.rawText?.trim() || "";

  if (opts.recallEmpty || !opts.otherId) {
    const fallback = emptyFallback(rawWish, opts.lang, opts.wishLane);
    const system = isZh
      ? `你是 Maitri Side by Side 的第二拍回复。用户刚才已收到「我去看看」的第一拍；现在匹配已完成，池子里没有人符合硬条件。
写 2-4 句简体中文：明确说暂时还没有合适的活动心愿/搭子（禁止说「开始找/正在找」）；${isBrowse(opts.wishLane) ? "不要说「心愿已发布/记下」——用户只是在浏览搜索。" : "可复述心愿；"}自然建议放宽时间/活动/城市或改发心愿。事实与【统计】一致。禁止「新朋友」「认识新朋友」。${selfVoiceRule(true)}
JSON：{"reply":"..."}`
      : `You are Maitri Side by Side — second beat after matching. Pool is empty.
2-4 sentences: clearly no match yet (never say "starting to look"); ${isBrowse(opts.wishLane) ? "do not say wish published/saved — user was only browsing." : "recap wish if helpful;"} suggest loosening filters or posting a wish. Never say "meet someone new". ${selfVoiceRule(false)}
JSON: {"reply":"..."}`;
    const user = isZh
      ? `【搜索条件/心愿】${rawWish || "（未填）"}\n【模式】${isBrowse(opts.wishLane) ? "浏览池子" : "已发布心愿"}\n【放宽提示】${opts.relaxHints.join(" ") || "无"}`
      : `[Filters/wish] ${rawWish || "(empty)"}\n[Mode] ${isBrowse(opts.wishLane) ? "browse pool" : "published wish"}\n[Relax hints] ${opts.relaxHints.join(" ") || "none"}`;
    return streamFollowup(system, user, fallback, opts.onDelta);
  }

  const other = getIntentById(opts.otherId);
  if (!other) {
    return emptyFallback(rawWish, opts.lang, opts.wishLane);
  }

  const fallback = introFallback(other, opts.matchReason, opts.crossCityMatch, opts.lang);
  if (useTemplateIntro(opts.crossCityMatch, opts.matchQuality)) {
    return fallback;
  }

  const name = isZh ? other.ownerName_zh : other.ownerName;
  const theirWish = isZh ? other.rawText_zh || other.rawText : other.rawText;
  const city = isZh ? other.city_zh || other.city : other.city || other.ownerCity;

  const system = isZh
    ? `你是 Maitri Side by Side 的第二拍回复。第一拍已说「我去看看」；现在匹配完成，请介绍这位搭子/池子里的活动心愿。
写 3-5 句简体中文：自然介绍对方想做什么、为什么可能合适（用【匹配理由】，勿编造）；若跨城必须点明。邀请用户看右边卡片。禁止「MATCH FOUND」式播报；禁止「新朋友」「认识新朋友」——用「搭子」「活动心愿」「池子里的人」。${selfVoiceRule(true)}
JSON：{"reply":"..."}`
    : `Second beat — introduce the matched buddy / wish from the pool. 3-5 warm sentences: their wish, why it fits (use [Match reason]), cross-city if needed. Invite them to the card on the right. Never say "meet someone new" — say buddy / activity wish / person in the pool. ${selfVoiceRule(false)}
JSON: {"reply":"..."}`;

  const user = isZh
    ? `【我的心愿/搜索条件】${rawWish}
【对方】${name}，${city}
【对方心愿】${theirWish}
【匹配理由】${opts.matchReason?.trim() || "（活动类型与时间相近）"}
【匹配质量】${opts.matchQuality ?? "exact"}
【跨城】${opts.crossCityMatch ? "是" : "否"}`
    : `[My wish/filters] ${rawWish}
[Buddy] ${name}, ${city}
[Their wish] ${theirWish}
[Match reason] ${opts.matchReason?.trim() || "(activity/time overlap)"}
[Quality] ${opts.matchQuality ?? "exact"}
[Cross-city] ${opts.crossCityMatch ? "yes" : "no"}`;

  return streamFollowup(system, user, fallback, opts.onDelta);
}

export function sideMatchAckFallback(
  lang: SideLang,
  rawWish: string,
  wishLane?: WishLane,
): string {
  if (zh(lang)) {
    if (isBrowse(wishLane)) {
      return rawWish
        ? `好的，条件记下了：${rawWish}。我去池子里看看有没有合适的活动心愿。`
        : "好的，条件记下了。我去池子里看看有没有合适的活动心愿。";
    }
    return rawWish
      ? `好的，心愿记下了：${rawWish}。我去池子里看看有没有合适的搭子。`
      : "好的，心愿记下了。我去池子里看看有没有合适的搭子。";
  }
  if (isBrowse(wishLane)) {
    return rawWish
      ? `Got it — filters saved: ${rawWish}. Let me check the wish pool.`
      : "Got it — filters saved. Let me check the wish pool.";
  }
  return rawWish
    ? `Got it — wish saved: ${rawWish}. Let me check the pool for a good buddy.`
    : "Got it — wish saved. Let me check the pool for a good buddy.";
}
