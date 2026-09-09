/**
 * Side by Side lane: browse others' wishes vs publish your own.
 * Lanes are independent — browse does not require publish.
 */

import type { SideLang } from "./wish-types";

export type WishLane = "unset" | "browse" | "publish";

const BROWSE_RE =
  /看看|先看看|浏览|有没有|有谁|帮我找|找一下|搜一下|找搭子|别人的心愿|池子里|随便看看|browse|look around|see if anyone|anyone looking|search|find someone/i;
const PUBLISH_RE =
  /发布|发一个|挂出|挂上去|发心愿|我想.{0,12}(一起|约)(?!.*搭子)|post my wish|publish/i;
/** Activity/buddy criteria — not a lane switch away from browse. */
const BROWSE_CRITERIA_RE =
  /搭子|跑步|网球|徒步|看展|运动|做饭|攀岩|骑行|游泳|羽毛球|篮球|足球|run|running|hike|climb|tennis|buddy/i;
const SWITCH_BROWSE_RE =
  /还是先看看|想看看别人|不发了|先看看|改.?看|switch to browse|just browse|look first/i;
const SWITCH_PUBLISH_RE =
  /还是发|自己发|发布心愿|改.?发|switch to publish|post my wish|publish mine/i;
const OFFER_MATCH_YES_RE =
  /好|要|行|可以|嗯|顺便|帮我找|开始找|找吧|yes|sure|ok|okay|please|go ahead/i;
const OFFER_MATCH_NO_RE =
  /不用|不要|先不|算了|不用了|no thanks|not now|maybe later|skip/i;

export function isWishLaneSelectionMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Lane pick plus activity details — not a pure lane selection chip.
  if (/^(我想)?(发布|发).{0,12}心愿\s*[:：].+/i.test(t)) return false;
  if (/^(我想)?(发布|发)(自己的(活动)?)?心愿[。.!！]?$/i.test(t)) return true;
  if (/^(我想)?先看看别人(的(活动)?)?(心愿)?[。.!！]?$/i.test(t)) return true;
  if (/^I want to (publish my wish|browse others(?:'|')? wishes first)[.!?]?$/i.test(t)) return true;
  return false;
}

/** Handoff/orchestrator seeds that name no concrete activity — must not pre-fill wish draft. */
export function isVagueExploreWishSeed(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 56) return false;
  if (
    /(跑步|徒步|爬山|网球|篮球|足球|游泳|骑行|攀岩|做饭|桌游|看展|散步|露营|瑜伽|羽毛球|乒乓球|hike|run|tennis|climb|swim|yoga)/i.test(
      t,
    )
  ) {
    return false;
  }
  return /探索|有趣的活动|不知道做什么|没想好做什么|随便什么活动|explore|interesting activit|not sure what/i.test(
    t,
  );
}

/** Greetings / lane chips / vague explore — must not become wishDraft.rawText. */
export function isNonWishDraftSeed(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isWishLaneSelectionMessage(t)) return true;
  if (isVagueExploreWishSeed(t)) return true;
  if (/^(你好|您好|嗨|哈喽|在吗|hello|hi|hey)([啊呀呵吗嘛！!。.～~\s]*)$/i.test(t)) return true;
  return false;
}

export function wishLanePickedPromptSection(lane: WishLane, lang: SideLang): string {
  if (lang === "zh-CN") {
    return lane === "publish"
      ? `用户刚选了「发布心愿」。自然确认即可，用开放问题请他们说想做什么、有什么要求（时间地点、搭子期待可一起说）——措辞随上下文，勿用固定模板；confirmLine=null。若用户这轮其实就要搜搭子再设 affirmMatch；只是选模式则 affirmMatch=false。`
      : `用户刚选了「先看看别人的心愿」。自然确认；若只是选模式，问想找什么样的活动，affirmMatch=false。若用户这轮明确就要搜（随便看看/帮我找），affirmMatch=true——信息不齐也能搜，冷启动 soft。`;
  }
  return lane === "publish"
    ? `User just chose publish. Acknowledge; one open question for activity + requirements — no templates; confirmLine=null. affirmMatch only if they also want a search this turn.`
    : `User just chose browse. If lane-only, ask what activity they want (affirmMatch=false). If they clearly want to search now, affirmMatch=true — sparse draft + cold-start soft is fine.`;
}

export function inferWishLaneFromText(text: string): WishLane | null {
  const t = text.trim();
  if (!t) return null;
  if (isVagueExploreWishSeed(t)) return null;
  if (/发布.*心愿|发.*心愿|publish.*wish/i.test(t)) return "publish";
  if (/先看看|看.*心愿|browse.*wish/i.test(t)) return "browse";
  if (BROWSE_CRITERIA_RE.test(t) && !/发布|挂出|publish/i.test(t)) return "browse";
  const browse = BROWSE_RE.test(t);
  const publish = PUBLISH_RE.test(t);
  if (browse && !publish) return "browse";
  if (publish && !browse) return "publish";
  if (browse && publish) {
    if (/发布|挂出|发心愿|post|publish/i.test(t)) return "publish";
    if (/看看|浏览|browse|look/i.test(t)) return "browse";
  }
  return null;
}

export function detectWishLaneSwitch(text: string, current: WishLane): WishLane | null {
  if (current === "unset") return inferWishLaneFromText(text);
  if (SWITCH_BROWSE_RE.test(text)) return "browse";
  if (SWITCH_PUBLISH_RE.test(text)) return "publish";
  return null;
}

export function canSwitchWishLane(state: {
  wishLane: WishLane;
  stage: "prompt" | "published" | "chat";
  myIntentId: string | null;
}): boolean {
  if (state.stage === "chat") return false;
  if (state.stage === "published" && state.myIntentId && state.wishLane === "publish") {
    return true;
  }
  if (state.myIntentId) return true;
  return state.stage === "prompt";
}

export function isOfferMatchAffirmation(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (OFFER_MATCH_NO_RE.test(t)) return false;
  return OFFER_MATCH_YES_RE.test(t);
}

export function isOfferMatchDecline(text: string): boolean {
  return OFFER_MATCH_NO_RE.test(text.trim());
}

export function wishLaneChoicePromptSection(lang: SideLang): string {
  if (lang === "zh-CN") {
    return `心愿 lane（未选择时必做）：
先问用户想「发布自己的心愿」还是「先看看池子里别人的心愿」——自然一句话即可，不要模板腔。
suggestions 根据当前对话自行生成 2 条第一人称短句（发布 vs 浏览），勿照抄固定模板。
未选定 lane 前：不要追问活动/时间等字段；affirmPublish=false；pickMatchIntentId=null；confirmLine=null。`;
  }
  return `Wish lane (required when unset):
Ask whether they want to publish their own wish or browse others' wishes in the pool — one natural sentence.
suggestions MUST be exactly 2 first-person phrases (publish vs browse) tailored to context — do not copy fixed templates.
Until lane is chosen: do not clarify activity/time; affirmPublish=false; pickMatchIntentId=null; confirmLine=null.`;
}

export function wishLaneSwitchPromptSection(lane: WishLane, lang: SideLang): string {
  if (lang === "zh-CN") {
    return lane === "browse"
      ? `当前 lane：看心愿（在心愿池里搜别人的活动心愿，不是「介绍具体某个人」；不要求发布）。用户说「找跑步搭子」等是在补充搜索条件，不是切换 lane。仅当用户明确说「我还是自己发一个」才切换到发布。`
      : `当前 lane：发心愿（AI 只总结并预填表单，用户亲手点发布；不自动匹配）。用户可说「还是先看看别人的」切换到浏览。`;
  }
  return lane === "browse"
    ? `Current lane: browse (search activity wishes in the pool — not introducing a specific person; publish not required). "Running buddy" etc. are search filters, not a lane switch. Switch to publish only if they clearly want to post their own wish.`
    : `Current lane: publish (AI summarizes and prefills the form; user taps Publish — no auto-match). User may switch to browse.`;
}
