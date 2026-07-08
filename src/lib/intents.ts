// Side by Side — the "intent pool".
//
// Everyone (including the user) publishes a short "I want to do X, at Y, at Z
// level" record into a shared pool. Matching happens between two records.
// The match card can then quote both sides verbatim — that's the "source of
// truth" for anything the UI shows about the other person.

import type { Activity, ActivityKind, Person, Weekday } from "./types";
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

  /** The person's own words. What the match card quotes as "TA 说". */
  rawText: string;
  rawText_zh: string;

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
  };
  const kindZh: Record<ActivityKind, string> = {
    tennis: "打网球", run: "跑步", climb: "攀岩",
    cook: "一起做饭", exhibition: "看展", bookstore: "逛书店",
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

export function publishMyIntent(input: {
  kind: ActivityKind;
  when: WhenTier;
  level?: LevelTier;
  rawText: string;
}): Intent {
  // Concretize when into a representative day/window for display.
  const day: Weekday = input.when === "weeknight" ? "wed" : "sat";
  const window: "morning" | "midday" | "evening" =
    input.when === "weeknight" ? "evening"
    : LEVEL_KINDS.includes(input.kind) || input.kind === "run" ? "morning"
    : "evening";
  const intent: Intent = {
    id: `me:${Date.now().toString(36)}`,
    ownerId: "me",
    ownerName: "You", ownerName_zh: "你",
    ownerCity: "", ownerCity_zh: "",
    kind: input.kind,
    level: input.level ?? "intermediate",
    day, window,
    venue: "", venue_zh: "",
    rawText: input.rawText,
    rawText_zh: input.rawText,
    createdAt: Date.now(),
  };
  const list = loadMyIntents();
  saveMyIntents([...list, intent]);
  return intent;
}

export function revokeMyIntent(id: string) {
  const list = loadMyIntents();
  saveMyIntents(list.filter((i) => i.id !== id));
}

export function clearMyIntents() {
  saveMyIntents([]);
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

/** Look through seed pool for someone whose intent is compatible with mine. */
export function findMatch(mine: Intent, opts?: { exclude?: string[] }): Intent | null {
  const excluded = new Set(opts?.exclude ?? []);
  const mineWhen = slotToWhen(mine.day, mine.window);
  const pool = seedPool()
    .filter((it) => it.ownerId !== mine.ownerId && !excluded.has(it.id))
    .filter((it) => it.kind === mine.kind)
    .filter((it) => whenCompatible(mineWhen, slotToWhen(it.day, it.window)))
    .filter((it) => levelCompatible(mine.kind, mine.level, it.level));
  if (pool.length === 0) return null;
  pool.sort((a, b) => score(mine, b) - score(mine, a));
  return pool[0];
}

/** Same kind, but when/level don't line up — useful "you might want to shift" hints. */
export function findNearMisses(mine: Intent, opts?: { exclude?: string[] }): Intent[] {
  const excluded = new Set(opts?.exclude ?? []);
  const mineWhen = slotToWhen(mine.day, mine.window);
  return seedPool()
    .filter((it) => it.ownerId !== mine.ownerId && !excluded.has(it.id) && it.kind === mine.kind)
    .filter((it) =>
      !whenCompatible(mineWhen, slotToWhen(it.day, it.window)) ||
      !levelCompatible(mine.kind, mine.level, it.level),
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
