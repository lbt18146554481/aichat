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
      ? `用户刚想说清活动邀约：自然确认；开放问想一起做什么；confirmLine=null。要搜走主提示【决策】。`
      : `用户刚想找搭子：自然确认；没说活动则问想一起做什么（affirmMatch=false）。要搜走【决策】。`;
  }
  return lane === "publish"
    ? `They want to spell out an invite: acknowledge; open question; confirmLine=null. Search → Decision.`
    : `They want a buddy: acknowledge; if no activity, ask what to do (affirmMatch=false). Search → Decision.`;
}

export function wishLaneChoicePromptSection(lang: SideLang): string {
  if (lang === "zh-CN") {
    return `开场：能力介绍后请对方说想一起做什么；不要问发布/看池子。suggestions 给活动例子短句。`;
  }
  return `Opening: after capability intro, ask what to do together — never publish vs browse. Activity-example suggestions.`;
}

export function wishLaneSwitchPromptSection(lane: WishLane, lang: SideLang): string {
  if (lang === "zh-CN") {
    return lane === "browse"
      ? `模式：找人。补充条件=完善邀约。缺地点按【决策】弹卡。`
      : `模式：说清邀约（可开表单）。直接找人 →【决策】。`;
  }
  return lane === "browse"
    ? `Mode: people search. Extra criteria refine invite. Missing place → Decision card.`
    : `Mode: clarify invite (optional form). Find someone → Decision.`;
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
