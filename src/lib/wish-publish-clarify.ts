/**
 * Publish-lane clarification: event → time → place → extra description.
 */

import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { SideLang, WishDraft, WishHardFilters } from "./wish-types";
import { formatActivityWindow } from "./wish-date";

export const PUBLISH_CLARIFY_MAX_ROUNDS = 5;

export type PublishDimension = "event" | "time" | "place" | "extra";

export type DimensionStatus = "missing" | "done";

export interface WishPublishClarifyProgress {
  event: DimensionStatus;
  time: DimensionStatus;
  place: DimensionStatus;
  extra: DimensionStatus;
  focus: PublishDimension | "intake" | "confirm" | "cap";
  roundCount: number;
  capReached: boolean;
  allDone: boolean;
  intakeDone: boolean;
}

const FLEX_RE =
  /不限|都可以|都行|无所谓|随便|没要求|无要求|没偏好|无偏好|anywhere|any time|no preference|flexible|don't care/i;
const TIME_RE =
  /周末|weekend|工作日|weekday|weeknight|早上|上午|中午|下午|晚上|傍晚|周[一二三四五六日]|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this weekend|next week/i;
const EXTRA_RE =
  /搭子|水平|新手|进阶|话多|安静|备注|补充|另外|prefer|buddy|level|note|extra|detail/i;
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
  if (eventDone(draft)) return true;
  if ((draft.rawText?.trim().length ?? 0) >= 4) return true;
  return userMsgs.some((t) => t.length >= 4);
}

function userTextFromHistory(history: Array<{ role: string; content: string }>): string {
  return history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

function countRounds(history: Array<{ role: string; content: string }>): number {
  return history.filter((m) => m.role === "user").length;
}

function eventDone(draft: WishDraft): boolean {
  const raw = draft.rawText?.trim() ?? "";
  if (!raw) return false;
  if (draft.kind != null) return true;
  return raw.length >= 6;
}

function timeDone(draft: WishDraft, combinedUserText: string): boolean {
  if (draft.dateStart && draft.timeStart && draft.timeEnd) return true;
  if (draft.dateStart) return true;
  if (!draft.whenAny && draft.when) return true;
  if (TIME_RE.test(draft.rawText)) return true;
  if (TIME_RE.test(combinedUserText)) return true;
  if (FLEX_RE.test(combinedUserText) && /时间|时候|when|time/i.test(combinedUserText)) return true;
  return false;
}

function publishPlaceDone(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  combinedUserText: string,
): boolean {
  const text = combinedUserText.trim();
  if (!text) return false;

  const placeFlex =
    /地点不限|位置不限|哪(儿|里)都(行|可以)|没有具体(地点|位置|偏好)|不挑(地点|地方|在哪)|随便哪|全城|全市|anywhere|any place|any area|no (specific )?(place|location|area|preference)/i;
  if (placeFlex.test(text)) return true;

  const specificPlace =
    /公园|路线|跑道|奥森|朝阳|海淀|浦东|陆家嘴|区|路\d|街|venue|park|trail|track|gym|场|湖|江|河|广场|中心|mall|studio|河沿|绿道|滨江|操场|体育馆|cycle path|running route/i;
  if (specificPlace.test(text)) return true;
  if (specificPlace.test(draft.placeRaw ?? "")) return true;
  if (specificPlace.test(draft.rawText ?? "")) return true;
  if (/(市区|郊区|城东|城西|北边|南边|downtown|district|suburb)/i.test(text)) return true;

  // Named city without a venue is enough to prefill the form — user can refine there.
  if (
    /(?:在|^)(北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|重庆|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|昆明|贵阳|哈尔滨|沈阳|长春|石家庄|太原|济南|合肥|南昌|南宁|海口|兰州|银川|西宁|拉萨|呼和浩特|乌鲁木齐)(?:市)?/.test(
      text,
    )
  ) {
    return true;
  }
  if (hardFilters.cities.length > 0 && specificPlace.test(text)) return true;

  return false;
}

function placeDone(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  _profileCity: string,
  combinedUserText: string,
): boolean {
  return publishPlaceDone(draft, hardFilters, combinedUserText);
}

function extraDone(
  draft: WishDraft,
  understanding: UserUnderstanding,
  combinedUserText: string,
): boolean {
  if (understanding.notes.some((n) => n.trim().length > 4)) return true;
  if (EXTRA_RE.test(combinedUserText)) return true;
  if (/没有要求|没要求|无要求|不限搭子|对搭子没有|no preference|no requirement/i.test(combinedUserText)) {
    return true;
  }
  if (/没有.*补充|无.*补充|就这些|没了|no more|nothing else/i.test(combinedUserText)) return true;
  if (draft.rawText.trim().length > 24) return true;
  return false;
}

function nextFocus(
  intakeComplete: boolean,
  event: DimensionStatus,
  time: DimensionStatus,
  place: DimensionStatus,
  extra: DimensionStatus,
  capReached: boolean,
): WishPublishClarifyProgress["focus"] {
  if (capReached) return "cap";
  if (!intakeComplete) return "intake";
  if (event === "missing") return "event";
  if (time === "missing") return "time";
  if (place === "missing") return "place";
  if (extra === "missing") return "extra";
  return "confirm";
}

/** History plus the current user turn when it is not already the last user line. */
export function publishClarifyHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage?: string | null,
): Array<{ role: "user" | "assistant"; content: string }> {
  const tail = userMessage?.trim();
  if (!tail) return history;
  const last = history[history.length - 1];
  if (last?.role === "user" && last.content.trim() === tail) return history;
  return [...history, { role: "user", content: tail }];
}

export function assessWishPublishClarifyProgress(input: {
  draft: WishDraft;
  hardFilters: WishHardFilters;
  understanding: UserUnderstanding;
  profile: Profile;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): WishPublishClarifyProgress {
  const combinedUserText = userTextFromHistory(input.history);
  const profileCity = input.profile.city?.trim() ?? "";
  const roundCount = countRounds(input.history);
  const capReached = roundCount >= PUBLISH_CLARIFY_MAX_ROUNDS;

  const event: DimensionStatus = eventDone(input.draft) ? "done" : "missing";
  const time: DimensionStatus = timeDone(input.draft, combinedUserText) ? "done" : "missing";
  const place: DimensionStatus = placeDone(
    input.draft,
    input.hardFilters,
    profileCity,
    combinedUserText,
  )
    ? "done"
    : "missing";
  const extra: DimensionStatus = extraDone(input.draft, input.understanding, combinedUserText)
    ? "done"
    : "missing";

  const allDone = event === "done" && time === "done" && place === "done" && extra === "done";
  const intakeComplete = intakeDone(input.draft, input.history);
  const focus = allDone
    ? "confirm"
    : nextFocus(intakeComplete, event, time, place, extra, capReached);

  return { event, time, place, extra, focus, roundCount, capReached, allDone, intakeDone: intakeComplete };
}

function statusLabel(status: DimensionStatus, lang: SideLang): string {
  if (lang === "zh-CN") return status === "done" ? "已收集" : "未收集";
  return status === "done" ? "collected" : "missing";
}

function focusHint(focus: WishPublishClarifyProgress["focus"], lang: SideLang): string {
  if (lang === "zh-CN") {
    switch (focus) {
      case "intake":
        return "开放问用户：想发布什么心愿、有什么要求（一条开放问题，不要拆成事件/时间/地点/补充逐项问）";
      case "event":
        return "想做什么（活动/事件；需 kind 或清晰 rawText）";
      case "time":
        return "什么时候（周末/具体日期/是否灵活）";
      case "place":
        return "在哪里（需具体城市/区域，或明确说「不限/都可以」；用户只回「城市」不算答完，要追问具体在哪）";
      case "extra":
        return "其他信息（与活动相关的任意补充；说「没有补充」也算完成）";
      case "confirm":
        return "四条已齐——用 confirmLine 写一句复述供表单预填；reply 提示用户在右侧表单检查并亲手点「发布」；affirmPublish 永远 false；禁止说已发布";
      case "cap":
        return "已达轮次上限——用 confirmLine 让用户按现有信息发布或再补充";
    }
  }
  switch (focus) {
    case "intake":
      return "open question: what wish to publish and any requirements (one open ask — do not split into event/time/place/extra yet)";
    case "event":
      return "what to do (activity/event — needs kind or clear rawText)";
    case "time":
      return "when (weekend/dates/flexible)";
    case "place":
      return "where (city/area or no preference)";
    case "extra":
      return "other info (anything about the activity; “nothing else” counts as done)";
    case "confirm":
      return "all four collected — confirmLine recap, ask to publish";
    case "cap":
      return "round cap — confirmLine: publish with what we have or add more";
  }
}

export function wishPublishClarifyPromptSection(
  progress: WishPublishClarifyProgress,
  lang: SideLang,
): string {
  const isZh = lang === "zh-CN";
  const lines = isZh
    ? [
        "发心愿澄清（publish lane）：先开放问一轮心愿+要求；用户说完后再按缺失项补问：①事件 → ②时间 → ③地点 → ④其他信息。话术自行生成。",
        `轮次上限 ${PUBLISH_CLARIFY_MAX_ROUNDS}（已用 ${progress.roundCount}/${PUBLISH_CLARIFY_MAX_ROUNDS}）。`,
        progress.capReached
          ? "⚠ 已达上限：confirmLine 预填表单，让用户点发布或继续改。"
          : progress.allDone
            ? "四条已齐：confirmLine 预填表单；reply 引导用户点发布按钮；affirmPublish=false；不要 pickMatchIntentId。"
            : "未齐之前：引向本轮焦点；不要发布或匹配。",
        `进度：①事件 ${statusLabel(progress.event, lang)} · ②时间 ${statusLabel(progress.time, lang)} · ③地点 ${statusLabel(progress.place, lang)} · ④其他信息 ${statusLabel(progress.extra, lang)}`,
        `本轮焦点：${focusHint(progress.focus, lang)}`,
      ]
    : [
        "Publish-lane clarification: first one open question for wish + requirements; after user answers, fill gaps in order: ① event → ② time → ③ place → ④ other info.",
        `Cap ${PUBLISH_CLARIFY_MAX_ROUNDS} (${progress.roundCount}/${PUBLISH_CLARIFY_MAX_ROUNDS} used).`,
        progress.capReached
          ? "⚠ Cap reached: confirmLine prefill form — user taps Publish or edits."
          : progress.allDone
            ? "All four collected: confirmLine prefill form; guide user to tap Publish; affirmPublish=false; no pickMatchIntentId."
            : "Until complete: steer to current focus; no publish or match.",
        `Progress: ① event ${statusLabel(progress.event, lang)} · ② time ${statusLabel(progress.time, lang)} · ③ place ${statusLabel(progress.place, lang)} · ④ other info ${statusLabel(progress.extra, lang)}`,
        `This turn focus: ${focusHint(progress.focus, lang)}`,
      ];
  return lines.join("\n");
}

/** Short verbal ack while the publish form is already on screen — not a new confirm round. */
export function isPublishFormAcknowledgement(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 28) return false;
  if (/改|补充|再|别|不要|edit|change|add|wait|not/i.test(t)) return false;
  return /^(是的|对|好|好的|确认|可以|行|嗯|没问题|就这样|ok|okay|yes|yep|sure|go ahead)[。.!！]?$/i.test(
    t,
  );
}

export function publishFormNudgeReply(lang: SideLang): string {
  return lang === "zh-CN"
    ? "好的，表单在右侧，确认没问题就直接点「发布」；想改的话也可以在那里调整。"
    : "Got it — the form is on the right; tap Publish when it looks right, or edit there first.";
}

/** Derive pendingConfirm — only from LLM confirmLine or an already-open form. */
export function resolvePublishPendingConfirm(opts: {
  confirmLine?: string | null;
  existing?: string | null;
}): string | null {
  if (opts.existing?.trim()) return opts.existing.trim();
  return opts.confirmLine?.trim() || null;
}

/**
 * Open the publish form when LLM confirmLine or structured progress says ready,
 * even if the model forgot confirmLine but stopped clarifying in reply.
 */
export function resolvePublishFormOpen(opts: {
  confirmLine?: string | null;
  existing?: string | null;
  reply: string;
  lang: SideLang;
  draft: WishDraft;
  hardFilters: WishHardFilters;
  readyToPublish: boolean;
  publishProgress: Pick<WishPublishClarifyProgress, "allDone" | "focus">;
}): string | null {
  const existing = opts.existing?.trim();
  if (existing) return existing;

  const stillClarifying = publishReplyStillClarifying(opts.reply, opts.lang);
  const fromLlm = opts.confirmLine?.trim() || null;
  if (stillClarifying) return null;
  if (fromLlm) return fromLlm;

  const structurallyReady =
    opts.readyToPublish ||
    opts.publishProgress.allDone ||
    opts.publishProgress.focus === "confirm";
  if (!structurallyReady) return null;

  const recap = buildPublishConfirmRecap(opts.lang, opts.draft, opts.hardFilters).trim();
  return recap || null;
}

/** True when the assistant reply is still asking the user to clarify (do not open publish form). */
export function publishReplyStillClarifying(reply: string, lang: SideLang): boolean {
  const r = reply.trim();
  if (!r) return false;
  if (lang === "zh-CN") {
    return (
      /[？?]$/.test(r) ||
      /(吗|么|呢)[。.!！]?$/.test(r) ||
      /(哪|什么|有没有|方便|偏好|具体|偏好吗|在哪里|哪个)/.test(r.slice(-48))
    );
  }
  return (
    /\?$/.test(r) ||
    /(where|which|what|prefer|specific|any preference|what area)/i.test(r.slice(-72))
  );
}

/** One-line recap for the publish form when the user verbally confirms pre-publish. */
export function buildPublishConfirmRecap(
  lang: SideLang,
  draft: WishDraft,
  _hardFilters: WishHardFilters,
): string {
  const line = formatActivityWindow(draft, lang);
  if (line && line !== (lang === "zh-CN" ? "时间未定" : "time TBD")) return line;
  return draft.rawText?.trim() || "";
}
