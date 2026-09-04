/**
 * Structured wish clarification: activity → when/where → buddy prefs.
 * Server assesses progress; LLM generates all wording.
 */

import { buddyFiltersActive, type BuddyHardFilters } from "./buddy-filters";
import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { SideLang, WishDraft, WishHardFilters } from "./wish-types";

export const WISH_CLARIFY_MAX_ROUNDS = 5;

export type ClarifyDimension = "activity" | "whenWhere" | "buddy";

export type DimensionStatus = "missing" | "done";

export interface WishClarifyProgress {
  activity: DimensionStatus;
  whenWhere: DimensionStatus;
  buddy: DimensionStatus;
  /** What to collect this turn; `intake` = open wish first; `confirm` = ready for publish recap; `cap` = hit round limit. */
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

export function isVagueClarifyFieldReply(text: string): boolean {
  return VAGUE_FIELD_REPLY_RE.test(text.trim());
}

export function hasSubstantivePlaceSignal(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  profileCity: string,
  combinedUserText: string,
): boolean {
  if (hardFilters.cities.length > 0) return true;
  if (draft.city?.trim()) return true;
  const lines = combinedUserText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const substantive = lines.filter((l) => !isVagueClarifyFieldReply(l));
  const text = substantive.join("\n");
  if (LOC_RE.test(draft.rawText) || LOC_RE.test(text)) return true;
  if (profileCity.trim() && FLEX_RE.test(text) && /(地点|城市|哪|不限|到处)/i.test(text)) return true;
  if (draft.allowCrossCity && /跨城|异地|other city/i.test(text)) return true;
  if (FLEX_RE.test(text) && /(地点|城市|哪|不限|到处|location|place|city)/i.test(text)) return true;
  if (timeDone(draft, combinedUserText) && FLEX_RE.test(text)) return true;
  if (
    /(北京|上海|广州|深圳|杭州|成都|温哥华|Vancouver|Tokyo|Berlin|纽约|New York|香港|台北|苏州|南京|武汉|西安|重庆)/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/(市区|郊区|城东|城西|北边|南边|downtown|district|suburb)/i.test(text)) return true;
  return false;
}
const LOC_RE =
  /市区|郊外|城里|公园|同城|跨城|异地|附近|location|area|district|downtown|suburb|in town|outskirts|same city/i;
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
  if (TIME_RE.test(draft.rawText)) return true;
  if (TIME_RE.test(combinedUserText)) return true;
  if (FLEX_RE.test(combinedUserText) && /时间|时候|when|time/i.test(combinedUserText)) return true;
  return false;
}

function locationDone(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  profileCity: string,
  combinedUserText: string,
): boolean {
  return hasSubstantivePlaceSignal(draft, hardFilters, profileCity, combinedUserText);
}

function whenWhereDone(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  profileCity: string,
  combinedUserText: string,
): boolean {
  return (
    timeDone(draft, combinedUserText) && locationDone(draft, hardFilters, profileCity, combinedUserText)
  );
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
  return false;
}

function nextFocus(
  intakeComplete: boolean,
  activity: DimensionStatus,
  whenWhere: DimensionStatus,
  buddy: DimensionStatus,
  capReached: boolean,
): WishClarifyProgress["focus"] {
  if (capReached) return "cap";
  if (!intakeComplete) return "intake";
  if (activity === "missing") return "activity";
  if (whenWhere === "missing") return "whenWhere";
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
  const whenWhere: DimensionStatus = whenWhereDone(
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

  const allDone = activity === "done" && whenWhere === "done" && buddy === "done";
  const intakeComplete = intakeDone(input.draft, input.history);
  const focus = allDone
    ? "confirm"
    : nextFocus(intakeComplete, activity, whenWhere, buddy, capReached);

  return {
    activity,
    whenWhere,
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
        return "开放问用户：想做什么、有什么要求（一条开放问题，不要拆成活动/时间/地点/搭子逐项问）";
      case "activity":
        return "活动类型（如户外、看展、运动、做饭等；需能落到 kind 或清晰 rawText）";
      case "whenWhere":
        return "时间 + 地点（可一轮一起问；时间含周末/具体日期/是否灵活；地点需具体城市/区域或明确说「不限/都可以」——用户只回「城市」不算答完，要追问具体在哪）";
      case "buddy":
        return "对活动搭子的要求或偏好（性别/年龄/水平/性格等；用户说「没要求」也算收集完成）";
      case "confirm":
        return "三条已齐——用 confirmLine 供表单预填；reply 引导用户在表单点「发布」；affirmPublish 永远 false";
      case "cap":
        return "已达 5 轮上限——不要再开新问题；用 confirmLine 请用户选「按现有信息继续」或「再补充」，话术自行组织";
    }
  }
  switch (focus) {
    case "intake":
      return "open question: what they want to do and any requirements (one open ask — do not split into activity/time/place/buddy yet)";
    case "activity":
      return "activity type (outdoor, exhibition, sports, cook, etc. — needs kind or clear rawText)";
    case "whenWhere":
      return "time + place (ask together ok; weekend/dates/flexible; city/area or no preference)";
    case "buddy":
      return "buddy preferences (gender/age/level/personality; “no preference” counts as done)";
    case "confirm":
      return "all three collected — confirmLine recap, affirmPublish only after user confirms";
    case "cap":
      return "5-round cap — no new questions; confirmLine: proceed with what we have or add more";
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

export function wishClarifyPromptSection(
  progress: WishClarifyProgress,
  lang: SideLang,
  mode: "browse" | "publish" = "publish",
): string {
  const isZh = lang === "zh-CN";
  const lines = isZh
    ? [
        "心愿澄清流程（未发布时必遵，话术全部由你自行生成，禁止固定模板句）：",
        "第一步：用一条开放问题请用户说出心愿和要求（想做什么、时间地点、对搭子的期待等都可以先说）；不要一上来就拆成活动/时间/地点/搭子逐项追问。",
        "第二步：用户说完后，从已提取信息判断还缺什么，再按顺序补问：①活动类型 → ②时间+地点 → ③搭子偏好。",
        "理想路径：开放问一轮 → 用户自由说 → 只追问仍缺失的条（每条最多一轮）；用户同一轮里若已说清当前条，可进入下一条。",
        "当前条若未提取到有效信息：继续追问当前条，不要跳到后面尚未收集的条。",
        "每条内部可轻问 1-2 个相关点（如时间地点可同句），但不要一次把三条全问完。",
        `澄清轮次上限 ${WISH_CLARIFY_MAX_ROUNDS} 轮（已用 ${progress.roundCount}/${WISH_CLARIFY_MAX_ROUNDS}，按用户发言次数计）。`,
        progress.capReached
          ? mode === "browse"
            ? "⚠ 已达上限：用 confirmLine 让用户按现有条件开始浏览或再补充；affirmMatch 须用户确认后。"
            : "⚠ 已达上限：confirmLine 预填表单，让用户点发布或继续改。"
          : progress.allDone
            ? mode === "browse"
              ? "三条已齐：用 confirmLine 复述搜索条件并请用户确认开始浏览（不是发布）；affirmMatch 须用户确认后再 true；不要继续说「我去搜/稍等」。"
              : "三条信息已齐：confirmLine 仅预填发布表单；reply 引导用户点表单「发布」；affirmPublish 永远 false。"
            : mode === "browse"
              ? "未齐之前：只追问「本轮焦点」；禁止说「我去搜/稍等/在现有的人里找」——搜心愿池要等用户确认浏览条件后由系统执行。affirmMatch=false；pickMatchIntentId=null。"
              : "未齐之前：先回应当前用户说的话，再自然引向「本轮焦点」；不要提前发布或 pickMatchIntentId。",
        `进度：①活动类型 ${statusLabel(progress.activity, lang)} · ②时间地点 ${statusLabel(progress.whenWhere, lang)} · ③搭子偏好 ${statusLabel(progress.buddy, lang)}`,
        `本轮焦点：${focusHint(progress.focus, lang)}`,
      ]
    : [
        "Wish clarification (before publish — generate all wording yourself, no fixed templates):",
        "Step 1: one open question — ask for their wish and requirements (activity, time/place, buddy prefs — they may say it all at once). Do not open with a checklist of fields.",
        "Step 2: after they answer, assess gaps and collect in order: ① activity → ② time + place → ③ buddy prefs.",
        "Ideal: one open turn → user speaks freely → follow up only on missing items (one turn per item when needed).",
        "If the current item is still missing: keep asking that item; do not skip ahead.",
        "You may combine 1-2 related points within one item (e.g. time + place together), but do not ask all three items at once.",
        `Cap: ${WISH_CLARIFY_MAX_ROUNDS} user turns (${progress.roundCount}/${WISH_CLARIFY_MAX_ROUNDS} used).`,
        progress.capReached
          ? mode === "browse"
            ? "⚠ Cap reached: confirmLine — browse with current filters or add more; affirmMatch only after user confirms."
            : "⚠ Cap reached: confirmLine prefill form — user taps Publish or edits."
          : progress.allDone
            ? mode === "browse"
              ? "All three collected: confirmLine recap search filters and ask to start browsing (not publish); affirmMatch only after confirm; never say you're searching now."
              : "All three collected: confirmLine prefill publish form only; guide user to tap Publish; affirmPublish always false."
            : mode === "browse"
              ? "Until complete: ask only the current focus; NEVER say you'll search / wait a moment / look through people — browsing runs after user confirms. affirmMatch=false; pickMatchIntentId=null."
              : "Until complete: respond to the user, then naturally steer to the current focus; no publish or pickMatchIntentId yet.",
        `Progress: ① activity ${statusLabel(progress.activity, lang)} · ② time/place ${statusLabel(progress.whenWhere, lang)} · ③ buddy ${statusLabel(progress.buddy, lang)}`,
        `This turn focus: ${focusHint(progress.focus, lang)}`,
      ];
  return lines.join("\n");
}
