import {
  findNearMisses,
  getIntentById,
  loadMyIntents,
  seedPool,
  slotToWhen,
  whenCompatible,
  levelCompatible,
  sameCity,
  tokenize,
  type Intent,
  type LevelTier,
  type MatchQuality,
  type WhenTier,
} from "./intents";
import { normalizeCity, personCityKey } from "./match-normalize";
import type { UserUnderstanding } from "./understanding";
import type { SideLang, WishHardFilters } from "./wish-types";

export const WISH_RECALL_LIMIT = 8;

export interface WishRecallOpts {
  mine: Intent;
  hardFilters: WishHardFilters;
  understanding: UserUnderstanding;
  exclude?: string[];
  excludeOwnerIds?: string[];
  limit?: number;
}

export interface RecalledWish {
  id: string;
  score: number;
  quality: MatchQuality;
  crossCity: boolean;
}

export interface WishRecallResult {
  candidates: RecalledWish[];
  nearMissIds: string[];
  sameCityEmpty: boolean;
  crossCityUsed: boolean;
}

function intentCityKey(it: Intent): string {
  return personCityKey(it.city || it.ownerCity, it.city_zh || it.ownerCity_zh);
}

function passesHardFilters(it: Intent, mine: Intent, f: WishHardFilters, respectCity: boolean): boolean {
  if (it.ownerId === mine.ownerId || it.id === mine.id) return false;

  if (respectCity && f.cities.length > 0) {
    const keys = f.cities.map(normalizeCity);
    const ck = intentCityKey(it);
    if (!keys.includes(ck)) return false;
  }

  if (f.excludeCities.length > 0) {
    const ck = intentCityKey(it);
    if (f.excludeCities.map(normalizeCity).includes(ck)) return false;
  }

  if (f.kinds.length > 0 && !f.kinds.includes(it.kind) && it.kind !== "other" && mine.kind !== "other") {
    if (!f.kinds.includes(mine.kind)) return false;
    if (it.kind !== mine.kind) return false;
  }

  return kindsCompatible(mine, it);
}

function kindsCompatible(mine: Intent, other: Intent): boolean {
  if (mine.kind === "other" || other.kind === "other") {
    const a = tokenize((mine.rawText || "") + " " + (mine.rawText_zh || ""));
    const b = tokenize((other.rawText || "") + " " + (other.rawText_zh || ""));
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    return n >= 1;
  }
  return mine.kind === other.kind;
}

function softScore(mine: Intent, other: Intent, u: UserUnderstanding): number {
  let s = 0;
  const mineWhen: WhenTier | undefined = mine.whenAny ? undefined : slotToWhen(mine.day, mine.window);
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;
  const theirLevel: LevelTier | undefined = other.levelAny ? undefined : other.level;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;

  if (mine.day === other.day && mine.window === other.window) s += 5;
  else if (whenCompatible(mineWhen, theirWhen)) s += 2;
  if (mine.level === other.level) s += 3;
  if (levelCompatible(kind, mineLevel, theirLevel ?? "intermediate")) s += 1;

  const notes = u.notes.join(" ").toLowerCase();
  const raw = `${other.rawText} ${other.rawText_zh}`.toLowerCase();
  for (const note of u.notes) {
    for (const w of note.toLowerCase().split(/\s+/).filter((x) => x.length > 2)) {
      if (raw.includes(w)) s += 1;
    }
  }
  if (notes && raw.includes(notes.slice(0, 8))) s += 1;

  return s;
}

function classifyQuality(mine: Intent, other: Intent): MatchQuality {
  const mineWhen: WhenTier | undefined = mine.whenAny ? undefined : slotToWhen(mine.day, mine.window);
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;
  const theirLevel: LevelTier | undefined = other.levelAny ? undefined : other.level;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;
  const whenOk = whenCompatible(mineWhen, theirWhen);
  const levelOk = levelCompatible(kind, mineLevel, theirLevel ?? "intermediate");
  if (whenOk && levelOk) return "exact";
  if (!whenOk && levelOk) return "relaxed-when";
  return "relaxed-level";
}

function poolFor(mine: Intent): Intent[] {
  return [...seedPool(), ...loadMyIntents().filter((it) => it.id !== mine.id)];
}

function recallFromPool(
  mine: Intent,
  opts: WishRecallOpts,
  respectCity: boolean,
): RecalledWish[] {
  const excluded = new Set(opts.exclude ?? []);
  const excludedOwners = new Set(opts.excludeOwnerIds ?? []);
  const limit = opts.limit ?? WISH_RECALL_LIMIT;

  const items = poolFor(mine)
    .filter((it) => !excluded.has(it.id) && !excludedOwners.has(it.ownerId))
    .filter((it) => passesHardFilters(it, mine, opts.hardFilters, respectCity))
    .filter((it) => kindsCompatible(mine, it));

  const scored = items
    .map((it) => ({
      id: it.id,
      score: softScore(mine, it, opts.understanding),
      quality: classifyQuality(mine, it),
      crossCity: respectCity ? false : !sameCity(mine, it),
    }))
    .sort((a, b) => b.score - a.score);

  const seenOwners = new Set<string>();
  const out: RecalledWish[] = [];
  for (const row of scored) {
    const it = getIntentById(row.id);
    if (!it || seenOwners.has(it.ownerId)) continue;
    seenOwners.add(it.ownerId);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function recallWishCandidates(opts: WishRecallOpts): WishRecallResult {
  const sameCity = recallFromPool(opts.mine, opts, true);
  if (sameCity.length > 0) {
    const nears = findNearMisses(opts.mine, {
      exclude: opts.exclude,
      excludeOwnerIds: opts.excludeOwnerIds,
    });
    return {
      candidates: sameCity,
      nearMissIds: nears.map((n) => n.id).slice(0, 3),
      sameCityEmpty: false,
      crossCityUsed: false,
    };
  }

  const cross = recallFromPool(opts.mine, opts, false);
  const nears = findNearMisses(opts.mine, {
    exclude: opts.exclude,
    excludeOwnerIds: opts.excludeOwnerIds,
  });
  return {
    candidates: cross,
    nearMissIds: nears.map((n) => n.id).slice(0, 3),
    sameCityEmpty: true,
    crossCityUsed: cross.length > 0,
  };
}

export function intentCardLine(intent: Intent, lang: SideLang, blocked: boolean): string {
  const zh = lang === "zh-CN";
  const name = zh ? intent.ownerName_zh : intent.ownerName;
  const city = zh ? intent.city_zh || intent.ownerCity_zh : intent.city || intent.ownerCity;
  const raw = zh ? intent.rawText_zh || intent.rawText : intent.rawText;
  const when = intent.whenAny ? "any" : slotToWhen(intent.day, intent.window);
  const level = intent.levelAny ? "any" : intent.level;
  const tag = blocked ? " [tried]" : "";
  return `- id=${intent.id} | ${name} | ${city} | kind=${intent.kind} | when=${when} | level=${level} | ${raw.slice(0, 80)}${tag}`;
}

export function rosterFromIntentIds(
  ids: string[],
  lang: SideLang,
  blocked: Set<string>,
): string {
  return ids
    .map((id) => {
      const it = getIntentById(id);
      if (!it) return null;
      return intentCardLine(it, lang, blocked.has(id));
    })
    .filter(Boolean)
    .join("\n");
}

export function pickNextFromRecall(
  recall: WishRecallResult,
  excludeIntentId?: string | null,
): RecalledWish | null {
  for (const c of recall.candidates) {
    if (c.id !== excludeIntentId) return c;
  }
  return null;
}
