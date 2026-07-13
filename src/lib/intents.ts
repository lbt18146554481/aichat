// Side by Side — the "intent pool".
//
// Everyone (including the user) publishes a short "I want to do X, when Y, at Z
// level" record into a shared pool. Matching happens between two records.
// The match card can then quote both sides verbatim — that's the "source of
// truth" for anything the UI shows about the other person.
//
// Kinds we recognize by keyword: tennis, run, climb, cook, exhibition, bookstore.
// Anything else the user types goes in as kind="other" and matches on shared
// keywords in the raw text — so "找人一起骑行" matches another "骑行" wish.

import type { Activity, ActivityKind, Weekday } from "./types";
import { PEOPLE } from "./people";

export type WhenTier = "weekend" | "weeknight" | "any";
export type LevelTier = "beginner" | "intermediate" | "advanced";

/** One published intent. Same shape whether it came from a seed person or you. */
export interface Intent {
  id: string;
  ownerId: string;          // person.id, or "me"
  ownerName: string;
  ownerName_zh: string;
  ownerCity: string;
  ownerCity_zh: string;

  kind: ActivityKind;
  level: LevelTier;
  day: Weekday;
  window: "morning" | "midday" | "evening";

  venue: string;
  venue_zh: string;

  /** The person's own words. What the match card quotes. */
  rawText: string;
  rawText_zh: string;

  /** True when the intent's `when` was unspecified — matches anyone. */
  whenAny?: boolean;
  /** True when the intent's `level` was unspecified — matches anyone. */
  levelAny?: boolean;
  /** Optional user-typed location note. Doesn't filter matches — shown as a tag. */
  location?: string;
  location_zh?: string;

  createdAt: number;
}


// ---- Compatibility ------------------------------------------------------

export const LEVEL_KINDS: ActivityKind[] = ["tennis", "climb"];
const LEVEL_ORDER: LevelTier[] = ["beginner", "intermediate", "advanced"];

export function slotToWhen(day: Weekday, window: "morning" | "midday" | "evening"): WhenTier {
  if (day === "sat" || day === "sun") return "weekend";
  if (window === "evening") return "weeknight";
  return "any";
}

export function whenCompatible(mine: WhenTier | undefined, theirs: WhenTier): boolean {
  if (!mine || mine === "any" || theirs === "any") return true;
  return mine === theirs;
}

export function levelCompatible(kind: ActivityKind, mine: LevelTier | undefined, theirs: LevelTier): boolean {
  if (!LEVEL_KINDS.includes(kind)) return true;
  if (!mine) return true;
  return Math.abs(LEVEL_ORDER.indexOf(mine) - LEVEL_ORDER.indexOf(theirs)) <= 1;
}

// ---- Seed pool: every person's activity → one intent per slot -----------

function synthesize(
  activity: Activity,
  slot: { day: Weekday; window: "morning" | "midday" | "evening" },
): { en: string; zh: string } {
  const kindEn: Record<ActivityKind, string> = {
    tennis: "hit some tennis",
    run: "go for a run",
    climb: "climb",
    cook: "cook together",
    exhibition: "catch an exhibition",
    bookstore: "wander a bookstore",
    other: "hang out",
  };
  const kindZh: Record<ActivityKind, string> = {
    tennis: "打网球", run: "跑步", climb: "攀岩",
    cook: "一起做饭", exhibition: "看展", bookstore: "逛书店",
    other: "一起做点什么",
  };
  const dayEn: Record<Weekday, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday",
    thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
  };
  const dayZh: Record<Weekday, string> = {
    mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日",
  };
  const winEn: Record<string, string> = { morning: "morning", midday: "midday", evening: "evening" };
  const winZh: Record<string, string> = { morning: "上午", midday: "中午", evening: "晚上" };
  const levelEn: Record<LevelTier, string> = {
    beginner: "just picked it up",
    intermediate: "casual, not too serious",
    advanced: "been at it a while",
  };
  const levelZh: Record<LevelTier, string> = {
    beginner: "新手",
    intermediate: "会一点，不较真",
    advanced: "打了有段时间了",
  };
  return {
    en: `Looking for someone to ${kindEn[activity.kind]} ${dayEn[slot.day]} ${winEn[slot.window]}s — ${levelEn[activity.level]}. Usually around ${activity.venue}.`,
    zh: `想找人${dayZh[slot.day]}${winZh[slot.window]}${kindZh[activity.kind]}——${levelZh[activity.level]}。常在${activity.venue_zh}。`,
  };
}

let _cache: Intent[] | null = null;
export function seedPool(): Intent[] {
  if (_cache) return _cache;
  const out: Intent[] = [];
  for (const p of PEOPLE) {
    p.activities.forEach((act, ai) => {
      act.slots.forEach((slot, si) => {
        const words = synthesize(act, slot);
        out.push({
          id: `${p.id}:${ai}:${si}`,
          ownerId: p.id,
          ownerName: p.name,
          ownerName_zh: p.name_zh,
          ownerCity: p.city,
          ownerCity_zh: p.city_zh,
          kind: act.kind,
          level: act.level,
          day: slot.day,
          window: slot.window,
          venue: act.venue,
          venue_zh: act.venue_zh,
          rawText: words.en,
          rawText_zh: words.zh,
          createdAt: 0,
        });
      });
    });
  }
  _cache = out;
  return out;
}

export function getIntentById(id: string): Intent | null {
  return seedPool().find((i) => i.id === id) ?? loadMyIntents().find((i) => i.id === id) ?? null;
}

// ---- My published intents (localStorage) --------------------------------

const MY_KEY = "kindred:sidebyside.my-intents.v1";

export function loadMyIntents(): Intent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Intent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveMyIntents(list: Intent[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(MY_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

function whenToSlot(when: WhenTier, kind: ActivityKind): { day: Weekday; window: "morning" | "midday" | "evening" } {
  const day: Weekday = when === "weeknight" ? "wed" : "sat";
  const window: "morning" | "midday" | "evening" =
    when === "weeknight" ? "evening"
    : LEVEL_KINDS.includes(kind) || kind === "run" ? "morning"
    : "evening";
  return { day, window };
}

export function publishMyIntent(input: {
  kind: ActivityKind;
  when?: WhenTier;      // undefined means "any"
  level?: LevelTier;    // undefined means "any"
  rawText: string;
}): Intent {
  const when: WhenTier = input.when ?? "any";
  const { day, window } = whenToSlot(when, input.kind);
  const intent: Intent = {
    id: `me:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    ownerId: "me",
    ownerName: "You", ownerName_zh: "你",
    ownerCity: "", ownerCity_zh: "",
    kind: input.kind,
    level: input.level ?? "intermediate",
    day, window,
    venue: "", venue_zh: "",
    rawText: input.rawText,
    rawText_zh: input.rawText,
    whenAny: !input.when,
    levelAny: !input.level,
    createdAt: Date.now(),
  };
  const list = loadMyIntents();
  saveMyIntents([...list, intent]);
  return intent;
}

/** Update fields on my intent — returns the new intent, or null if not found. */
export function updateMyIntent(id: string, patch: { when?: WhenTier; level?: LevelTier; location?: string }): Intent | null {
  const list = loadMyIntents();
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const cur = list[idx];
  let next: Intent = { ...cur };
  if (patch.when !== undefined) {
    const { day, window } = whenToSlot(patch.when, cur.kind);
    next.day = day; next.window = window; next.whenAny = patch.when === "any";
  }
  if (patch.level !== undefined) {
    next.level = patch.level; next.levelAny = false;
  }
  if (patch.location !== undefined) {
    const v = patch.location.trim();
    next.location = v || undefined;
    next.location_zh = v || undefined;
  }
  const nextList = [...list];
  nextList[idx] = next;
  saveMyIntents(nextList);
  return next;
}


export function revokeMyIntent(id: string) {
  const list = loadMyIntents();
  saveMyIntents(list.filter((i) => i.id !== id));
}

export function clearMyIntents() {
  saveMyIntents([]);
}

// ---- Keyword tokenizer (for kind="other" matching) ---------------------

const STOPWORDS = new Set([
  "want", "looking", "for", "some", "someone", "with", "the", "and", "a", "an", "to", "of",
  "usually", "around", "around", "casual", "serious", "not", "too", "just", "picked", "up",
  "morning", "mornings", "evening", "evenings", "midday", "afternoon",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend", "weeknight",
  // Chinese single words/particles
  "想", "找", "人", "一起", "和", "跟", "的", "了", "在", "有", "个", "点",
  // Chinese bigrams that show up in the seed template "想找人…" and in dates/levels
  "想找", "找人", "人周", "常在", "会一", "一点", "不较", "较真",
  "周一", "周二", "周三", "周四", "周五", "周六", "周日",
  "早上", "上午", "中午", "下午", "晚上", "傍晚",
  "新手", "中级", "进阶",
]);
export function tokenize(text: string): Set<string> {
  const t = text.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
  const out = new Set<string>();
  // English words length >= 3
  for (const w of t.split(/\s+/)) {
    if (w.length >= 3 && !STOPWORDS.has(w) && /^[a-z0-9]+$/.test(w)) out.add(w);
  }
  // CJK bigrams from every run of Han characters
  const hanRe = /[\u4e00-\u9fff]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = hanRe.exec(t)) !== null) {
    const chunk = m[0];
    for (let i = 0; i < chunk.length - 1; i++) {
      const bg = chunk.slice(i, i + 2);
      if (!STOPWORDS.has(bg)) out.add(bg);
    }
  }
  return out;
}
function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

// ---- Matching -----------------------------------------------------------

function score(mine: Intent, other: Intent): number {
  let s = 0;
  if (mine.day === other.day && mine.window === other.window) s += 5;
  else if (slotToWhen(mine.day, mine.window) === slotToWhen(other.day, other.window)) s += 2;
  if (mine.level === other.level) s += 3;
  else if (Math.abs(LEVEL_ORDER.indexOf(mine.level) - LEVEL_ORDER.indexOf(other.level)) === 1) s += 1;
  return s;
}

function kindsCompatible(mine: Intent, other: Intent): boolean {
  if (mine.kind === "other" || other.kind === "other") {
    // Match on keyword overlap in raw text.
    const a = tokenize((mine.rawText || "") + " " + (mine.rawText_zh || ""));
    const b = tokenize((other.rawText || "") + " " + (other.rawText_zh || ""));
    return overlapCount(a, b) >= 2;
  }
  return mine.kind === other.kind;
}

/** Look through seed pool + other users' intents for a compatible partner. */
export function findMatch(mine: Intent, opts?: { exclude?: string[] }): Intent | null {
  const excluded = new Set(opts?.exclude ?? []);
  const mineWhen: WhenTier | undefined = mine.whenAny ? undefined : slotToWhen(mine.day, mine.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;
  const pool = [...seedPool(), ...loadMyIntents().filter((it) => it.id !== mine.id)]
    .filter((it) => it.ownerId !== mine.ownerId && !excluded.has(it.id))
    .filter((it) => kindsCompatible(mine, it))
    .filter((it) => {
      const theirWhen: WhenTier = it.whenAny ? "any" : slotToWhen(it.day, it.window);
      return whenCompatible(mineWhen, theirWhen);
    })
    .filter((it) => {
      const kind = mine.kind !== "other" ? mine.kind : it.kind;
      const theirLevel: LevelTier | undefined = it.levelAny ? undefined : it.level;
      return levelCompatible(kind, mineLevel, theirLevel ?? "intermediate");
    });
  if (pool.length === 0) return null;
  pool.sort((a, b) => score(mine, b) - score(mine, a));
  return pool[0];
}

/** Same kind, but when/level don't line up — useful "you might want to shift" hints. */
export function findNearMisses(mine: Intent, opts?: { exclude?: string[] }): Intent[] {
  const excluded = new Set(opts?.exclude ?? []);
  const mineWhen = slotToWhen(mine.day, mine.window);
  return seedPool()
    .filter((it) => it.ownerId !== mine.ownerId && !excluded.has(it.id) && kindsCompatible(mine, it))
    .filter((it) =>
      !whenCompatible(mineWhen, slotToWhen(it.day, it.window)) ||
      !levelCompatible(mine.kind !== "other" ? mine.kind : it.kind, mine.level, it.level),
    )
    .slice(0, 3);
}

/** Sibling kinds inside the same activity group — for "try running instead". */
const KIND_GROUPS: ActivityKind[][] = [
  ["tennis", "run", "climb"],
  ["exhibition", "bookstore"],
  ["cook"],
];
export function siblingKinds(kind: ActivityKind): ActivityKind[] {
  const g = KIND_GROUPS.find((x) => x.includes(kind)) ?? [];
  return g.filter((k) => k !== kind);
}
