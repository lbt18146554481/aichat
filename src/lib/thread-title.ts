import type { UserUnderstanding } from "./understanding";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { GraftedMessage } from "./handoff";

const DEFAULT_MAX = 56;

/** Fixed chip prompts — not useful as history titles. */
const CHIP_MARKERS = [
  "please connect me with matchmaker",
  "please connect me with side by side",
  "请帮我转接到 matchmaker",
  "请帮我转接到 side by side",
  "connect me with matchmaker",
  "connect me with side by side",
];

export function truncateTitle(text: string, max = DEFAULT_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

export function isChipPrompt(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return CHIP_MARKERS.some((m) => lower.includes(m));
}

/** First sentence or clause — avoids dumping a whole paragraph into history. */
export function firstClause(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[。！？.!?])(?:\s|$)/);
  if (m?.[1] && m[1].length >= 4) return m[1].trim();
  return t;
}

export function sanitizeUserSeed(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || isChipPrompt(t)) return "";
  return truncateTitle(firstClause(t));
}

export function deriveThreadTitle(opts: {
  summary?: string | null;
  userText?: string | null;
  userMessages?: string[];
  maxLen?: number;
}): string {
  const max = opts.maxLen ?? DEFAULT_MAX;
  const summary = opts.summary?.trim();
  if (summary) return truncateTitle(summary, max);

  const candidates = [
    opts.userText?.trim(),
    ...(opts.userMessages ?? []).map((s) => s.trim()),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const cleaned = sanitizeUserSeed(raw);
    if (cleaned) return cleaned;
  }
  return "";
}

export function deriveHandoffSeed(h: {
  summary?: string;
  seed: string;
  graftedMessages?: GraftedMessage[];
}): string {
  const userMessages =
    h.graftedMessages?.filter((m) => m.role === "user").map((m) => m.content) ?? [];
  return (
    deriveThreadTitle({ summary: h.summary, userText: h.seed, userMessages }) ||
    truncateTitle(h.seed)
  );
}

/** Enough preference signal to refresh the history title (matchmaker milestone). */
export function matchmakerTitleMilestoneReady(
  u: UserUnderstanding,
  f: MatchHardFilters = EMPTY_HARD_FILTERS,
  extraText = "",
): boolean {
  if (f.ageMin != null || f.ageMax != null) return true;
  if (f.genders.length > 0 || f.excludeGenders.length > 0) return true;
  if (f.cities.length > 0 || f.educationMin || f.educationLevels.length > 0) return true;
  if (u.positive.length > 0 || u.negative.length > 0) return true;
  if (u.notes.some((n) => n.trim().length >= 6)) return true;
  const msg = extraText.trim();
  if (/随便(推|看|来)|先看看|推一个|谁都行|show me (someone|anyone)|surprise me|anyone is fine/i.test(msg)) {
    return true;
  }
  return false;
}

export function buildMatchmakerTitleContext(
  lang: "en" | "zh-CN",
  u: UserUnderstanding,
  hardFilters: MatchHardFilters,
  messages: Array<{ role: string; text: string }>,
): string {
  const recent = messages
    .filter((m) => m.text.trim())
    .slice(-6)
    .map((m) => `${m.role}: ${m.text.slice(0, 200)}`)
    .join("\n");
  const prefs = [
    u.positive.length ? `likes: ${u.positive.join(", ")}` : "",
    u.negative.length ? `dislikes: ${u.negative.join(", ")}` : "",
    u.notes.length ? `notes: ${u.notes.join(" | ")}` : "",
    hardFilters.cities.length ? `cities: ${hardFilters.cities.join(", ")}` : "",
    hardFilters.genders.length ? `genders: ${hardFilters.genders.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return lang === "zh-CN"
    ? `Agent：介绍人 Matchmaker\n偏好：\n${prefs || "（暂无）"}\n\n最近对话：\n${recent || "（无）"}`
    : `Agent: Matchmaker\nPreferences:\n${prefs || "(none)"}\n\nRecent chat:\n${recent || "(none)"}`;
}

export function buildSideBySideTitleContext(
  lang: "en" | "zh-CN",
  wishText: string,
  messages: Array<{ role: string; text: string }>,
): string {
  const recent = messages
    .filter((m) => m.text.trim())
    .slice(-4)
    .map((m) => `${m.role}: ${m.text.slice(0, 200)}`)
    .join("\n");
  return lang === "zh-CN"
    ? `Agent：Side by Side（一起做事）\n心愿：${wishText.slice(0, 300)}\n\n最近对话：\n${recent || "（无）"}`
    : `Agent: Side by Side\nWish: ${wishText.slice(0, 300)}\n\nRecent chat:\n${recent || "(none)"}`;
}
