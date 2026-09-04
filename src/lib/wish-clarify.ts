/**
 * Structured wish clarification for browse (and shared progress helpers):
 * activity → time → place → buddy.
 * Extra requirements are soft-only (not a completion gate).
 * Server assesses progress; LLM generates wording.
 */

import type { Intent } from "./intents";
import { buddyFiltersActive, type BuddyHardFilters } from "./buddy-filters";
import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { SideLang, WishDraft, WishHardFilters } from "./wish-types";
import { formatDateRangeLine, intentDateRange } from "./wish-date";
import {
  formatWishPlace,
  isPlaceClarifyComplete,
  isPlaceAny,
  normalizePlaceSpec,
} from "./wish-place";

export const WISH_CLARIFY_MAX_ROUNDS = 5;

export type ClarifyDimension = "activity" | "time" | "place" | "buddy";

export type DimensionStatus = "missing" | "done";

export interface WishClarifyProgress {
  activity: DimensionStatus;
  time: DimensionStatus;
  place: DimensionStatus;
  buddy: DimensionStatus;
  /** What to collect this turn; `intake` = open wish first; `confirm` = ready; `cap` = hit round limit. */
  focus: ClarifyDimension | "intake" | "confirm" | "cap";
  roundCount: number;
  capReached: boolean;
  allDone: boolean;
  intakeDone: boolean;
}

const FLEX_RE =
  /不限|都可以|都行|无所谓|随便|没要求|无要求|没偏好|无偏好|没特别|anywhere|any time|any place|no preference|doesn't matter|flexible|don't care/i;
/** User echoed a field label instead of answering (e.g. "城市" when asked which city). */
const VAGUE_FIELD_REPLY_RE =
  /^(城市|地点|位置|哪里|在哪|区域|时间|什么时候|水平|搭子)[？?]?$/i;

function isVagueClarifyFieldReply(text: string): boolean {
  return VAGUE_FIELD_REPLY_RE.test(text.trim());
}

function hasSubstantivePlaceSignal(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  _profileCity: string,
  combinedUserText: string,
): boolean {
  if (isPlaceClarifyComplete(draft)) return true;
  if (hardFilters.cities.length > 0) return true;
  if (draft.city?.trim() && !isPlaceAny(draft.city)) return true;
  if (draft.placeRaw?.trim()) {
    const raw = draft.placeRaw.trim();
    if (/线上|远程|online|virtual/i.test(raw)) return true;
    if (/不限|都行|anywhere/i.test(raw)) return true;
    if (raw.length >= 2) return true;
  }
  const lines = combinedUserText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const substantive = lines.filter((l) => !isVagueClarifyFieldReply(l));
  const text = substantive.join("\n");
  // Prefer structured draft; these cues only bridge until extract writes city/mode.
  if (FLEX_RE.test(text) && /(地点|城市|哪|不限|到处|location|place|city)/i.test(text)) return true;
  if (
    /(北京|上海|广州|深圳|杭州|成都|温哥华|Vancouver|Tokyo|Berlin|纽约|New York|香港|台北|苏州|南京|武汉|西安|重庆|线上|online)/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}
const TIME_RE =
  /周末|weekend|工作日|weekday|weeknight|早上|上午|中午|下午|晚上|傍晚|周[一二三四五六日]|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this weekend|next week/i;
const BUDDY_NONE_RE =
  /搭子.*(没|无|不|随便)|没有.*要求|无.*要求|没有.*偏好|无.*偏好|对搭子没|对搭子无|no buddy preference|anyone is fine|anyone works|don't care about buddy/i;
const BUDDY_PREF_RE =
  /搭子|buddy|一起.*人|女生|男生|年龄|岁|话多|安静|水平|新手|进阶|similar level|female|male|nonbinary/i;
const LANE_PICK_RE =
  /^(发布|先?发布|浏览|先看看|看看别人|browse|publish)(\s|的|心愿|别人)?$|^(我想?)?(发布|浏览)/i;

function isLaneOnlyMessage(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 28) return false;
  if (/(跑步|网球|徒步|爬山|做饭|展览|户外|散步|活动|周末|北京|上海)/i.test(t)) return false;
  return LANE_PICK_RE.test(t);
}

function intakeDone(draft: WishDraft, history: Array<{ role: string; content: string }>): boolean {
  const userMsgs = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter((t) => t.length > 0 && !isLaneOnlyMessage(t));
  if (userMsgs.length === 0) return false;
  if (activityDone(draft)) return true;
  if ((draft.rawText?.trim().length ?? 0) >= 4) return true;
  return userMsgs.some((t) => t.length >= 4);
}

function userTextFromHistory(history: Array<{ role: string; content: string }>): string {
  return history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

function countClarifyRounds(history: Array<{ role: string; content: string }>): number {
  return history.filter((m) => m.role === "user").length;
}

function activityDone(draft: WishDraft): boolean {
  if (draft.kind != null) return true;
  return (draft.rawText?.trim().length ?? 0) >= 2;
}

function timeDone(draft: WishDraft, combinedUserText: string): boolean {
  if (draft.dateStart) return true;
  if (!draft.whenAny && draft.when) return true;
  if (draft.whenAny && (draft.when === "any" || FLEX_RE.test(combinedUserText))) return true;
  if (TIME_RE.test(draft.rawText)) return true;
  if (TIME_RE.test(combinedUserText)) return true;
  if (FLEX_RE.test(combinedUserText) && /时间|时候|when|time/i.test(combinedUserText)) return true;
  return false;
}

function placeDone(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  profileCity: string,
  combinedUserText: string,
): boolean {
  return hasSubstantivePlaceSignal(draft, hardFilters, profileCity, combinedUserText);
}

function buddyDone(
  draft: WishDraft,
  buddy: BuddyHardFilters,
  understanding: UserUnderstanding,
  combinedUserText: string,
): boolean {
  if (buddyFiltersActive(buddy)) return true;
  if (BUDDY_NONE_RE.test(combinedUserText)) return true;
  if (understanding.notes.some((n) => BUDDY_NONE_RE.test(n))) return true;
  if (!draft.levelAny && draft.level) return true;
  if (understanding.positive.some((p) => BUDDY_PREF_RE.test(p))) return true;
  if (understanding.notes.some((n) => BUDDY_PREF_RE.test(n))) return true;
  if (BUDDY_PREF_RE.test(combinedUserText) && !/活动|activity|户外|展览|跑步|网球/i.test(combinedUserText)) {
    return true;
  }
  if (FLEX_RE.test(combinedUserText) && /(搭子|buddy|一起)/i.test(combinedUserText)) return true;
  return false;
}

function nextFocus(
  intakeComplete: boolean,
  activity: DimensionStatus,
  time: DimensionStatus,
  place: DimensionStatus,
  buddy: DimensionStatus,
  capReached: boolean,
): WishClarifyProgress["focus"] {
  if (capReached) return "cap";
  if (!intakeComplete) return "intake";
  if (activity === "missing") return "activity";
  if (time === "missing") return "time";
  if (place === "missing") return "place";
  if (buddy === "missing") return "buddy";
  return "confirm";
}

export function assessWishClarifyProgress(input: {
  draft: WishDraft;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  understanding: UserUnderstanding;
  profile: Profile;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): WishClarifyProgress {
  const combinedUserText = userTextFromHistory(input.history);
  const profileCity = input.profile.city?.trim() ?? "";
  const roundCount = countClarifyRounds(input.history);
  const capReached = roundCount >= WISH_CLARIFY_MAX_ROUNDS;

  const activity: DimensionStatus = activityDone(input.draft) ? "done" : "missing";
  const time: DimensionStatus = timeDone(input.draft, combinedUserText) ? "done" : "missing";
  const place: DimensionStatus = placeDone(
    input.draft,
    input.hardFilters,
    profileCity,
    combinedUserText,
  )
    ? "done"
    : "missing";
  const buddy: DimensionStatus = buddyDone(
    input.draft,
    input.buddyHardFilters,
    input.understanding,
    combinedUserText,
  )
    ? "done"
    : "missing";

  const allDone = activity === "done" && time === "done" && place === "done" && buddy === "done";
  const intakeComplete = intakeDone(input.draft, input.history);
  const focus = allDone
    ? "confirm"
    : nextFocus(intakeComplete, activity, time, place, buddy, capReached);

  return {
    activity,
    time,
    place,
    buddy,
    focus,
    roundCount,
    capReached,
    allDone,
    intakeDone: intakeComplete,
  };
}

function statusLabel(status: DimensionStatus, lang: SideLang): string {
  if (lang === "zh-CN") return status === "done" ? "已收集" : "未收集";
  return status === "done" ? "collected" : "missing";
}

function focusHint(focus: WishClarifyProgress["focus"], lang: SideLang): string {
  if (lang === "zh-CN") {
    switch (focus) {
      case "intake":
        return "先开放：请用户用自己的话说想做什么、有什么要求（不要拆成字段清单）";
      case "activity":
        return "缺口参考·活动（想一起做什么；能落到 activityCore/kind 或清晰描述即可）";
      case "time":
        return "缺口参考·时间（何时方便，或明确说时间都行）";
      case "place":
        return "缺口参考·地点（哪里，或地点不限/线上）——只回「城市」两个字不算答完";
      case "buddy":
        return "缺口参考·搭子（对一起的人有没有偏好；说「没要求」也算齐）。额外要求可顺手记。";
      case "confirm":
        return "信息已够——browse：confirmLine 复述并请确认开搜；publish：confirmLine 预填表单";
      case "cap":
        return "已达轮次上限——不要再开新问题；confirmLine 按现有信息请确认（缺的字段空着=匹配不限）";
    }
  }
  switch (focus) {
    case "intake":
      return "open first: invite wish + requirements in their own words (no field checklist)";
    case "activity":
      return "gap hint · activity (what to do together)";
    case "time":
      return "gap hint · when (or explicitly flexible)";
    case "place":
      return "gap hint · where (or anywhere / online)";
    case "buddy":
      return "gap hint · buddy prefs (“no preference” counts). Extra notes soft-only.";
    case "confirm":
      return "enough info — confirmLine for browse search or publish form";
    case "cap":
      return "turn cap — confirmLine with what we have; missing = no hard filter";
  }
}

export function isBrowseClarifyComplete(input: {
  draft: WishDraft;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  understanding: UserUnderstanding;
  profile: Profile;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): boolean {
  const p = assessWishClarifyProgress(input);
  return p.allDone || p.capReached;
}

/** One-line browse confirm recap from current structured draft (server fallback). */
export function buildBrowseConfirmRecap(
  lang: SideLang,
  draft: WishDraft,
  hardFilters: WishHardFilters,
): string {
  const isZh = lang === "zh-CN";
  const activity = draft.rawText?.trim() || (draft.kind ? String(draft.kind) : "");
  const dates = formatDateRangeLine(
    intentDateRange({
      dateStart: draft.dateStart,
      dateEnd: draft.dateEnd,
    } as Intent),
    lang,
  );
  const whenBit =
    draft.dateStart
      ? dates
      : draft.whenAny || !draft.when
        ? isZh
          ? "时间不限"
          : "any time"
        : draft.when === "weekend"
          ? isZh
            ? "周末"
            : "weekend"
          : draft.when === "weeknight"
            ? isZh
              ? "工作日晚上"
              : "weeknights"
            : String(draft.when);
  const city =
    (() => {
      const spec = normalizePlaceSpec(draft);
      if (spec.placeMode === "online") return isZh ? "线上" : "online";
      if (spec.placeMode === "any" || isPlaceAny(spec.place?.city)) return isZh ? "地点不限" : "anywhere";
      return (
        formatWishPlace(draft, lang) ||
        draft.city_zh?.trim() ||
        draft.city?.trim() ||
        hardFilters.cities[0] ||
        (isZh ? "地点未限" : "place open")
      );
    })();
  const place = city;
  const buddy = isZh ? "搭子要求已记下（含没要求）" : "buddy prefs noted";
  if (isZh) {
    const bits = [activity || "活动", whenBit, place].filter(Boolean);
    return `我按这些条件在池子里找：${bits.join("，")}。还可以，还是要再改？`;
  }
  const bits = [activity || "activity", whenBit, place].filter(Boolean);
  return `I'll search the pool with: ${bits.join(", ")}. Sound good, or want to tweak?`;
}

export function wishClarifyPromptSection(
  progress: WishClarifyProgress,
  lang: SideLang,
  mode: "browse" | "publish" = "publish",
): string {
  const isZh = lang === "zh-CN";
  const lines = isZh
    ? [
        "心愿澄清（话术自行生成，禁止固定模板句 / 禁止每轮固定追问清单）：",
        "先听用户自己的想法：开放请对方说想做什么、有什么要求。",
        "再说完后对照进度，只补真正还缺的维度（活动 / 时间 / 地点 / 搭子）。缺口列表与「建议焦点」只是参考——不要规定本轮必须问某一项，也不要强制按 ①→②→③→④ 逐项审问；可自然组合 1-3 个相关缺口，或先回应用户再决定问不问。",
        "额外要求只顺手记下，不单独当完成门槛。用户说「都行/随便」按你刚问的语境理解。",
        `澄清轮次上限 ${WISH_CLARIFY_MAX_ROUNDS} 轮（已用 ${progress.roundCount}/${WISH_CLARIFY_MAX_ROUNDS}，按用户发言次数计）。`,
        progress.capReached
          ? mode === "browse"
            ? "⚠ 已达上限：必须用 confirmLine 复述目前已知条件，问是否按此开搜；缺的字段保持空即可（匹配时当作不限）。affirmMatch 须用户确认后。禁止再说「我去搜」。"
            : "⚠ 已达上限：confirmLine 预填表单，让用户点发布或继续改。"
          : progress.allDone
            ? mode === "browse"
              ? "信息已齐：必须用 confirmLine 复述搜索条件并请用户确认开搜（不是发布）；affirmMatch 仅用户确认后为 true；禁止说「我去搜/稍等」。"
              : "信息已齐：confirmLine 预填发布表单；reply 引导点「发布」；affirmPublish 永远 false。"
            : mode === "browse"
              ? "未齐：先回应用户；若补问只针对缺口参考，措辞自定。禁止说「我去搜/稍等/在池子里找」——开搜须等 confirmLine + 用户口头确认。affirmMatch=false；pickMatchIntentId=null。"
              : "未齐：先回应用户；若补问只针对缺口参考。不要提前发布或 pickMatchIntentId。",
        `进度：活动 ${statusLabel(progress.activity, lang)} · 时间 ${statusLabel(progress.time, lang)} · 地点 ${statusLabel(progress.place, lang)} · 搭子 ${statusLabel(progress.buddy, lang)}`,
        `建议焦点（非剧本）：${focusHint(progress.focus, lang)}`,
      ]
    : [
        "Wish clarification (your wording — no fixed templates / no per-turn question script):",
        "Listen first: open invite for wish + requirements in their words.",
        "Then fill only real gaps (activity / time / place / buddy). Progress + suggested focus are hints — never mandate one field per turn or force ①→②→③→④ interrogation; combine 1-3 related gaps or just respond.",
        "Extra notes are soft-only. Interpret “anything goes” from what you just asked.",
        `Cap: ${WISH_CLARIFY_MAX_ROUNDS} user turns (${progress.roundCount}/${WISH_CLARIFY_MAX_ROUNDS} used).`,
        progress.capReached
          ? mode === "browse"
            ? "⚠ Cap reached: must use confirmLine to recap known filters and ask to search; leave missing fields empty (= no hard filter). affirmMatch only after user confirms. Never say you're searching now."
            : "⚠ Cap reached: confirmLine prefill form — user taps Publish or edits."
          : progress.allDone
            ? mode === "browse"
              ? "Enough info: must confirmLine recap search filters and ask to start browsing (not publish); affirmMatch only after confirm; never say you're searching now."
              : "Complete: confirmLine prefill publish form; guide user to tap Publish; affirmPublish always false."
            : mode === "browse"
              ? "Incomplete: respond first; follow-ups only from gap hints, wording yours. NEVER say you'll search / wait — browsing runs after confirmLine + verbal confirm. affirmMatch=false; pickMatchIntentId=null."
              : "Incomplete: respond first; follow-ups only from gap hints. No publish or pickMatchIntentId yet.",
        `Progress: activity ${statusLabel(progress.activity, lang)} · time ${statusLabel(progress.time, lang)} · place ${statusLabel(progress.place, lang)} · buddy ${statusLabel(progress.buddy, lang)}`,
        `Suggested focus (not a script): ${focusHint(progress.focus, lang)}`,
      ];
  return lines.join("\n");
}
