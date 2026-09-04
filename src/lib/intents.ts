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
import { buildSeedPeople } from "./people-seed.data";
import { listBlocked } from "./blocklist";
import type { IntentStatus } from "./intent-index";
import { normalizeTimeHHmm } from "./wish-date";
import { ownerSnapshotFromPerson, type OwnerSnapshot } from "./owner-snapshot";
import type { WishPlace } from "./wish-place";
import type { BuddyMatchQuery } from "./wish-match-profile";

export type { OwnerSnapshot } from "./owner-snapshot";
export type WhenTier = "weekend" | "weeknight" | "any";
export type LevelTier = "beginner" | "intermediate" | "advanced";

/** One published intent. Same shape whether it came from a seed person or you. */
export interface Intent {
  id: string;
  ownerId: string; // person.id, or "me"
  ownerName: string;
  ownerName_zh: string;
  ownerCity: string;
  ownerCity_zh: string;

  /** Hard filter for matching. Same value as ownerCity for seed people;
   *  for "me" it comes from Profile.city (or a per-wish override typed in
   *  the raw text like "in Tokyo"). We match same-city only. */
  city: string;
  city_zh: string;

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
  status?: IntentStatus;
  /** When true, when mismatch is hard-filtered during recall. */
  strictWhen?: boolean;
  /** When true, level must match exactly (tennis/climb). */
  strictLevel?: boolean;
  /** User opted in to cross-city recall. */
  allowCrossCity?: boolean;
  /** Publisher demographics snapshot at publish time. */
  ownerSnapshot?: OwnerSnapshot;
  /** Calendar window YYYY-MM-DD (inclusive). */
  dateStart?: string;
  dateEnd?: string;
  /** Local start/end time HH:mm when a precise window is known. */
  timeStart?: string;
  timeEnd?: string;
  /** Legacy: free-text location note. No longer filters matches; kept
   *  only so old localStorage state stays readable. Use `city` instead. */
  location?: string;
  location_zh?: string;

  /** Original free-text place from the publish form. */
  placeRaw?: string;
  /** User opted in to any offline location (不限). */
  placeFlex?: boolean;
  /** Activity is online-only (线上). */
  placeOnline?: boolean;
  /** Structured place extracted at publish. */
  place?: WishPlace;

  activityDescRaw?: string;
  buddyPrefRaw?: string;
  otherReqRaw?: string;
  buddyMatchQuery?: BuddyMatchQuery;

  createdAt: number;
}

/** Compare two city labels tolerantly — trims, case-insensitive, and
 *  matches either the English or Chinese label on both sides. */
export function sameCity(a: Intent, b: Intent): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const aEn = norm(a.city || a.ownerCity || "");
  const aZh = norm(a.city_zh || a.ownerCity_zh || "");
  const bEn = norm(b.city || b.ownerCity || "");
  const bZh = norm(b.city_zh || b.ownerCity_zh || "");
  if ((!aEn && !aZh) || (!bEn && !bZh)) return false;
  if (aEn && (aEn === bEn || aEn === bZh)) return true;
  if (aZh && (aZh === bEn || aZh === bZh)) return true;
  return false;
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

export function levelCompatible(
  kind: ActivityKind,
  mine: LevelTier | undefined,
  theirs: LevelTier,
): boolean {
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
    tennis: "打网球",
    run: "跑步",
    climb: "攀岩",
    cook: "一起做饭",
    exhibition: "看展",
    bookstore: "逛书店",
    other: "一起做点什么",
  };
  const dayEn: Record<Weekday, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  const dayZh: Record<Weekday, string> = {
    mon: "周一",
    tue: "周二",
    wed: "周三",
    thu: "周四",
    fri: "周五",
    sat: "周六",
    sun: "周日",
  };
  const winEn: Record<string, string> = {
    morning: "morning",
    midday: "midday",
    evening: "evening",
  };
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

/** Extra synthetic wishes so the demo pool reaches ~40 entries. */
const EXTRA_SEED_INTENTS: Omit<Intent, "createdAt">[] = [
  {
    id: "extra:berlin-run-1",
    ownerId: "seed-berlin-run",
    ownerName: "Mika",
    ownerName_zh: "米卡",
    ownerCity: "Berlin",
    ownerCity_zh: "柏林",
    city: "Berlin",
    city_zh: "柏林",
    kind: "run",
    level: "intermediate",
    day: "sat",
    window: "morning",
    venue: "Tiergarten",
    venue_zh: "蒂尔加滕公园",
    rawText: "Saturday morning jog around Tiergarten — steady pace, not a race.",
    rawText_zh: "周六早上蒂尔加滕慢跑，配速稳定，不竞速。",
  },
  {
    id: "extra:berlin-cook-1",
    ownerId: "seed-berlin-cook",
    ownerName: "Jonas",
    ownerName_zh: "约纳斯",
    ownerCity: "Berlin",
    ownerCity_zh: "柏林",
    city: "Berlin",
    city_zh: "柏林",
    kind: "cook",
    level: "beginner",
    day: "sun",
    window: "evening",
    venue: "home kitchen",
    venue_zh: "家里厨房",
    rawText: "Sunday evening cook-together — simple pasta, BYO wine.",
    rawText_zh: "周日晚一起做饭，意面为主，可自带酒。",
  },
  {
    id: "extra:brooklyn-climb-1",
    ownerId: "seed-bk-climb",
    ownerName: "Rae",
    ownerName_zh: "蕾",
    ownerCity: "Brooklyn",
    ownerCity_zh: "布鲁克林",
    city: "Brooklyn",
    city_zh: "布鲁克林",
    kind: "climb",
    level: "intermediate",
    day: "wed",
    window: "evening",
    venue: "Brooklyn Boulders",
    venue_zh: "Brooklyn Boulders",
    rawText: "Weeknight bouldering at Brooklyn Boulders — V4-ish, chalk buddies welcome.",
    rawText_zh: "工作日晚上抱石，V4 左右，欢迎一起蹭粉。",
  },
  {
    id: "extra:brooklyn-book-1",
    ownerId: "seed-bk-book",
    ownerName: "Sam",
    ownerName_zh: "山姆",
    ownerCity: "Brooklyn",
    ownerCity_zh: "布鲁克林",
    city: "Brooklyn",
    city_zh: "布鲁克林",
    kind: "bookstore",
    level: "intermediate",
    day: "sat",
    window: "midday",
    venue: "McNally Jackson",
    venue_zh: "McNally Jackson",
    rawText: "Saturday afternoon wandering McNally Jackson — fiction picks and coffee after.",
    rawText_zh: "周六下午逛 McNally Jackson，挑小说，结束喝咖啡。",
  },
  {
    id: "extra:kyoto-exhibit-1",
    ownerId: "seed-kyoto-ex",
    ownerName: "Hana",
    ownerName_zh: "花",
    ownerCity: "Kyoto",
    ownerCity_zh: "京都",
    city: "Kyoto",
    city_zh: "京都",
    kind: "exhibition",
    level: "beginner",
    day: "sun",
    window: "midday",
    venue: "National Museum",
    venue_zh: "国立博物馆",
    rawText: "Sunday museum hop in Kyoto — slow pace, sketching welcome.",
    rawText_zh: "周日京都看展，节奏慢，欢迎速写。",
  },
  {
    id: "extra:lisbon-tennis-1",
    ownerId: "seed-lisbon-ten",
    ownerName: "Tiago",
    ownerName_zh: "蒂亚戈",
    ownerCity: "Lisbon",
    ownerCity_zh: "里斯本",
    city: "Lisbon",
    city_zh: "里斯本",
    kind: "tennis",
    level: "advanced",
    day: "sat",
    window: "morning",
    venue: "Cascais courts",
    venue_zh: "卡斯凯什球场",
    rawText: "Saturday morning tennis in Cascais — rally-focused, decent serve.",
    rawText_zh: "周六早上卡斯凯什打网球，以对拉为主，发球还行。",
  },
  {
    id: "extra:rome-run-1",
    ownerId: "seed-rome-run",
    ownerName: "Luca",
    ownerName_zh: "卢卡",
    ownerCity: "Rome",
    ownerCity_zh: "罗马",
    city: "Rome",
    city_zh: "罗马",
    kind: "run",
    level: "beginner",
    day: "sun",
    window: "morning",
    venue: "Villa Borghese",
    venue_zh: "博尔盖塞别墅",
    rawText: "Easy Sunday jog in Villa Borghese — walk-run ok.",
    rawText_zh: "周日博尔盖塞轻松跑，走跑都行。",
  },
  {
    id: "extra:beijing-walk-1",
    ownerId: "seed-bj-walk-1",
    ownerName: "Lin",
    ownerName_zh: "林溪",
    ownerCity: "Beijing",
    ownerCity_zh: "北京",
    city: "Beijing",
    city_zh: "北京",
    kind: "other",
    level: "beginner",
    day: "sat",
    window: "morning",
    venue: "Olympic Forest Park",
    venue_zh: "奥林匹克森林公园",
    rawText: "Easy weekend walk in Olympic Forest Park — slow pace, happy to chat.",
    rawText_zh: "周末奥林匹克森林公园轻松散步，慢走就好，可以聊聊天。",
    whenAny: false,
    levelAny: true,
    status: "active",
  },
  {
    id: "extra:beijing-walk-2",
    ownerId: "seed-bj-walk-2",
    ownerName: "Yan",
    ownerName_zh: "严悦",
    ownerCity: "Beijing",
    ownerCity_zh: "北京",
    city: "Beijing",
    city_zh: "北京",
    kind: "other",
    level: "beginner",
    day: "sun",
    window: "midday",
    venue: "Beihai Park",
    venue_zh: "北海公园",
    rawText: "Sunday stroll around Beihai Park — no rush, casual outdoor walk.",
    rawText_zh: "周日北海公园附近随便走走，轻松户外散步，不赶时间。",
    whenAny: false,
    levelAny: true,
    status: "active",
  },
  {
    id: "extra:beijing-walk-3",
    ownerId: "seed-bj-walk-3",
    ownerName: "Wei",
    ownerName_zh: "魏然",
    ownerCity: "Beijing",
    ownerCity_zh: "北京",
    city: "Beijing",
    city_zh: "北京",
    kind: "run",
    level: "beginner",
    day: "sat",
    window: "morning",
    venue: "Chaoyang Park",
    venue_zh: "朝阳公园",
    rawText: "Saturday morning easy walk-run loop in Chaoyang Park — beginner friendly.",
    rawText_zh: "周六早上朝阳公园轻松走跑一圈，户外散步为主，新手友好。",
    whenAny: false,
    levelAny: true,
    status: "active",
  },
  {
    id: "extra:vancouver-climb-1",
    ownerId: "seed-van-climb",
    ownerName: "Morgan",
    ownerName_zh: "摩根",
    ownerCity: "Vancouver",
    ownerCity_zh: "温哥华",
    city: "Vancouver",
    city_zh: "温哥华",
    kind: "climb",
    level: "beginner",
    day: "sat",
    window: "midday",
    venue: "The Hive",
    venue_zh: "The Hive",
    rawText: "Saturday intro-to-top-rope at The Hive — patient belay partner wanted.",
    rawText_zh: "周六 The Hive 入门顶绳，找有耐心保护的人。",
  },
  {
    id: "extra:cdmx-cook-1",
    ownerId: "seed-cdmx-cook",
    ownerName: "Sofia",
    ownerName_zh: "索菲亚",
    ownerCity: "Mexico City",
    ownerCity_zh: "墨西哥城",
    city: "Mexico City",
    city_zh: "墨西哥城",
    kind: "cook",
    level: "intermediate",
    day: "fri",
    window: "evening",
    venue: "Condesa",
    venue_zh: "孔德萨",
    rawText: "Friday night taco night in Condesa — split prep, swap salsa recipes.",
    rawText_zh: "周五晚上孔德萨塔可夜，分工备料，交换辣酱配方。",
  },
  {
    id: "extra:telaviv-run-1",
    ownerId: "seed-tlv-run",
    ownerName: "Noa",
    ownerName_zh: "诺阿",
    ownerCity: "Tel Aviv",
    ownerCity_zh: "特拉维夫",
    city: "Tel Aviv",
    city_zh: "特拉维夫",
    kind: "run",
    level: "intermediate",
    day: "tue",
    window: "evening",
    venue: "Tayelet",
    venue_zh: "海滨步道",
    rawText: "Tuesday sunset run along Tayelet — 5–8k.",
    rawText_zh: "周二傍晚海滨步道跑 5–8 公里。",
  },
  {
    id: "extra:cph-exhibit-1",
    ownerId: "seed-cph-ex",
    ownerName: "Freja",
    ownerName_zh: "弗雷娅",
    ownerCity: "Copenhagen",
    ownerCity_zh: "哥本哈根",
    city: "Copenhagen",
    city_zh: "哥本哈根",
    kind: "exhibition",
    level: "intermediate",
    day: "sat",
    window: "midday",
    venue: "Louisiana",
    venue_zh: "路易斯安那博物馆",
    rawText: "Saturday trip to Louisiana — contemporary wing, train from Copenhagen.",
    rawText_zh: "周六去路易斯安那博物馆，看当代展，哥本哈根坐火车。",
  },
  {
    id: "extra:lagos-other-1",
    ownerId: "seed-lagos-other",
    ownerName: "Amara",
    ownerName_zh: "阿玛拉",
    ownerCity: "Lagos",
    ownerCity_zh: "拉各斯",
    city: "Lagos",
    city_zh: "拉各斯",
    kind: "other",
    level: "beginner",
    day: "sat",
    window: "evening",
    venue: "Lekki",
    venue_zh: "莱基",
    rawText: "Looking for someone to try new live music spots in Lekki on Saturdays.",
    rawText_zh: "周六想在莱基一起探新店/live house。",
  },
  {
    id: "extra:ba-tennis-1",
    ownerId: "seed-ba-ten",
    ownerName: "Mateo",
    ownerName_zh: "马特奥",
    ownerCity: "Buenos Aires",
    ownerCity_zh: "布宜诺斯艾利斯",
    city: "Buenos Aires",
    city_zh: "布宜诺斯艾利斯",
    kind: "tennis",
    level: "intermediate",
    day: "sun",
    window: "morning",
    venue: "Palermo courts",
    venue_zh: "巴勒莫球场",
    rawText: "Sunday doubles in Palermo — casual, split court fee.",
    rawText_zh: "周日巴勒莫双打，休闲局，场地费分摊。",
  },
  {
    id: "extra:edinburgh-book-1",
    ownerId: "seed-edin-book",
    ownerName: "Ewan",
    ownerName_zh: "尤恩",
    ownerCity: "Edinburgh",
    ownerCity_zh: "爱丁堡",
    city: "Edinburgh",
    city_zh: "爱丁堡",
    kind: "bookstore",
    level: "beginner",
    day: "sat",
    window: "midday",
    venue: "Golden Hare",
    venue_zh: "Golden Hare",
    rawText: "Saturday browse at Golden Hare — sci-fi swaps and tea.",
    rawText_zh: "周六逛 Golden Hare，科幻换书，喝茶聊天。",
  },
  {
    id: "extra:rome-cook-1",
    ownerId: "seed-rome-cook",
    ownerName: "Giulia",
    ownerName_zh: "朱莉娅",
    ownerCity: "Rome",
    ownerCity_zh: "罗马",
    city: "Rome",
    city_zh: "罗马",
    kind: "cook",
    level: "advanced",
    day: "wed",
    window: "evening",
    venue: "Trastevere",
    venue_zh: "特拉斯提弗列",
    rawText: "Wednesday pasta night in Trastevere — from scratch, wine pairing ok.",
    rawText_zh: "周三特拉斯提弗列意面夜，从零开始，可配酒。",
  },
];

export function seedPool(): Intent[] {
  if (_cache) return _cache;
  const out: Intent[] = [];
  for (const p of buildSeedPeople()) {
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
          ownerSnapshot: ownerSnapshotFromPerson(p),
          city: p.city,
          city_zh: p.city_zh,
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
  for (const extra of EXTRA_SEED_INTENTS) {
    out.push({ ...extra, createdAt: 0 });
  }
  _cache = out;
  return out;
}

export function getIntentById(id: string): Intent | null {
  return seedPool().find((i) => i.id === id) ?? loadMyIntents().find((i) => i.id === id) ?? null;
}

// ---- My published intents (server-backed cache) -------------------------

let myIntentsCache: Intent[] = [];
const myIntentListeners = new Set<() => void>();

function emitMyIntents() {
  myIntentListeners.forEach((fn) => fn());
}

export function subscribeMyIntents(fn: () => void): () => void {
  myIntentListeners.add(fn);
  return () => {
    myIntentListeners.delete(fn);
  };
}

export function loadMyIntents(): Intent[] {
  return myIntentsCache;
}

function saveMyIntents(list: Intent[]) {
  myIntentsCache = list;
  emitMyIntents();
}

/** Replace one cached intent by id — returns false if not found. */
export function replaceMyIntentRecord(next: Intent): boolean {
  const list = loadMyIntents();
  const idx = list.findIndex((i) => i.id === next.id);
  if (idx < 0) return false;
  const nextList = [...list];
  nextList[idx] = next;
  saveMyIntents(nextList);
  return true;
}

export async function hydrateMyIntents() {
  const local = [...myIntentsCache];
  try {
    const { listMyIntentsFn } = await import("./api/data.functions");
    const server = await listMyIntentsFn();
    const byId = new Map<string, Intent>();
    for (const it of server) byId.set(it.id, it);
    for (const it of local) {
      if (!byId.has(it.id)) byId.set(it.id, it);
    }
    myIntentsCache = [...byId.values()];
  } catch {
    myIntentsCache = local;
  }
  return myIntentsCache;
}

function whenToSlot(
  when: WhenTier,
  kind: ActivityKind,
): { day: Weekday; window: "morning" | "midday" | "evening" } {
  const day: Weekday = when === "weeknight" ? "wed" : "sat";
  const window: "morning" | "midday" | "evening" =
    when === "weeknight"
      ? "evening"
      : LEVEL_KINDS.includes(kind) || kind === "run"
        ? "morning"
        : "evening";
  return { day, window };
}

export function publishMyIntent(input: {
  kind: ActivityKind;
  when?: WhenTier; // undefined means "any"
  level?: LevelTier; // undefined means "any"
  rawText: string;
  /** Required for real matching: the city this wish is scoped to.
   *  Callers pass Profile.city, or a per-wish override parsed from the raw
   *  text ("in Tokyo"). Pass ""/undefined only for tests. */
  city?: string;
  city_zh?: string;
  strictWhen?: boolean;
  strictLevel?: boolean;
  allowCrossCity?: boolean;
  ownerSnapshot?: OwnerSnapshot;
  dateStart?: string;
  dateEnd?: string;
  timeStart?: string;
  timeEnd?: string;
  placeRaw?: string;
  placeOnline?: boolean;
  placeFlex?: boolean;
  place?: WishPlace;
  activityDescRaw?: string;
  buddyPrefRaw?: string;
  otherReqRaw?: string;
  buddyMatchQuery?: BuddyMatchQuery;
  /** Server publish path — caller persists via upsertIntentIndex. */
  skipRemotePersist?: boolean;
}): Intent {
  const when: WhenTier = input.when ?? "any";
  const { day, window } = whenToSlot(when, input.kind);
  const city = (input.city ?? "").trim();
  const city_zh = (input.city_zh ?? "").trim() || city;
  const dateStart = input.dateStart?.trim() || undefined;
  const dateEnd = (input.dateEnd?.trim() || dateStart) || undefined;
  const timeStart = normalizeTimeHHmm(input.timeStart) || undefined;
  const timeEnd = normalizeTimeHHmm(input.timeEnd) || undefined;
  const activityDesc =
    input.activityDescRaw?.trim() || input.rawText?.trim() || "";
  const intent: Intent = {
    id: `me:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    ownerId: "me",
    ownerName: "You",
    ownerName_zh: "你",
    ownerCity: city,
    ownerCity_zh: city_zh,
    city,
    city_zh,
    kind: input.kind,
    level: input.level ?? "intermediate",
    day,
    window,
    venue: "",
    venue_zh: "",
    rawText: activityDesc,
    rawText_zh: activityDesc,
    whenAny: !input.when,
    levelAny: !input.level,
    status: "active",
    strictWhen: input.strictWhen ?? false,
    strictLevel: input.strictLevel ?? false,
    allowCrossCity: input.allowCrossCity ?? false,
    ownerSnapshot: input.ownerSnapshot,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
    placeRaw: input.placeRaw?.trim() || undefined,
    placeOnline: input.placeOnline ?? false,
    placeFlex: input.placeFlex ?? false,
    place: input.place,
    activityDescRaw: activityDesc || undefined,
    buddyPrefRaw: input.buddyPrefRaw?.trim() || undefined,
    otherReqRaw: input.otherReqRaw?.trim() || undefined,
    buddyMatchQuery: input.buddyMatchQuery,
    createdAt: Date.now(),
  };
  const list = loadMyIntents();
  saveMyIntents([...list, intent]);
  if (!input.skipRemotePersist) {
    void import("./api/data.functions").then(({ publishIntentFn }) =>
      publishIntentFn({ data: { intent: intent as unknown as Record<string, unknown> } }).catch(
        console.error,
      ),
    );
  }
  return intent;
}

/** Update fields on my intent — returns the new intent, or null if not found. */
export function updateMyIntent(
  id: string,
  patch: {
    when?: WhenTier;
    level?: LevelTier;
    location?: string;
    strictWhen?: boolean;
    strictLevel?: boolean;
    allowCrossCity?: boolean;
    /** Per-wish city override. Empty string clears it — caller should then
     *  fall back to Profile.city on the next publish. */
    city?: string;
    city_zh?: string;
  },
): Intent | null {
  const list = loadMyIntents();
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const cur = list[idx];
  const next: Intent = { ...cur };
  if (patch.when !== undefined) {
    const { day, window } = whenToSlot(patch.when, cur.kind);
    next.day = day;
    next.window = window;
    next.whenAny = patch.when === "any";
  }
  if (patch.level !== undefined) {
    next.level = patch.level;
    next.levelAny = false;
  }
  if (patch.location !== undefined) {
    const v = patch.location.trim();
    next.location = v || undefined;
    next.location_zh = v || undefined;
  }
  if (patch.city !== undefined) {
    const v = patch.city.trim();
    next.city = v;
    next.city_zh = (patch.city_zh ?? v).trim() || v;
    next.ownerCity = v;
    next.ownerCity_zh = next.city_zh;
  }
  if (patch.strictWhen !== undefined) next.strictWhen = patch.strictWhen;
  if (patch.strictLevel !== undefined) next.strictLevel = patch.strictLevel;
  if (patch.allowCrossCity !== undefined) next.allowCrossCity = patch.allowCrossCity;
  const nextList = [...list];
  nextList[idx] = next;
  saveMyIntents(nextList);
  return next;
}

export function revokeMyIntent(id: string) {
  const list = loadMyIntents();
  saveMyIntents(list.filter((i) => i.id !== id));
  void import("./api/data.functions").then(({ revokeIntentFn }) =>
    revokeIntentFn({ data: { id } }).catch(console.error),
  );
}

export function clearMyIntents() {
  saveMyIntents([]);
}

// ---- Keyword tokenizer (for kind="other" matching) ---------------------

const STOPWORDS = new Set([
  "want",
  "looking",
  "for",
  "some",
  "someone",
  "with",
  "the",
  "and",
  "a",
  "an",
  "to",
  "of",
  "usually",
  "around",
  "around",
  "casual",
  "serious",
  "not",
  "too",
  "just",
  "picked",
  "up",
  "morning",
  "mornings",
  "evening",
  "evenings",
  "midday",
  "afternoon",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "weekend",
  "weeknight",
  // Chinese single words/particles
  "想",
  "找",
  "人",
  "一起",
  "和",
  "跟",
  "的",
  "了",
  "在",
  "有",
  "个",
  "点",
  // Chinese bigrams that show up in the seed template "想找人…" and in dates/levels
  "想找",
  "找人",
  "人周",
  "常在",
  "会一",
  "一点",
  "不较",
  "较真",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
  "早上",
  "上午",
  "中午",
  "下午",
  "晚上",
  "傍晚",
  "新手",
  "中级",
  "进阶",
]);
export function tokenize(text: string): Set<string> {
  const t = text
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, " ")
    .trim();
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
  else if (Math.abs(LEVEL_ORDER.indexOf(mine.level) - LEVEL_ORDER.indexOf(other.level)) === 1)
    s += 1;
  return s;
}

function kindsCompatible(mine: Intent, other: Intent): boolean {
  if (mine.kind === "other" || other.kind === "other") {
    // Match on keyword overlap in raw text. One overlap is enough — the demo
    // pool is small and users say things in their own words, so requiring
    // two shared tokens starves the match view.
    const a = tokenize((mine.rawText || "") + " " + (mine.rawText_zh || ""));
    const b = tokenize((other.rawText || "") + " " + (other.rawText_zh || ""));
    return overlapCount(a, b) >= 1;
  }
  return mine.kind === other.kind;
}

type MatchOpts = { exclude?: string[]; excludeOwnerIds?: string[] };

function excludedOwners(opts?: MatchOpts): Set<string> {
  const s = new Set(opts?.excludeOwnerIds ?? []);
  if (typeof window !== "undefined") {
    for (const id of listBlocked()) s.add(id);
  }
  return s;
}

/** How well a candidate matches the user's wish. Drives the label on the card. */
export type MatchQuality = "exact" | "relaxed-when" | "relaxed-level";

/** Group compatible candidates into exact / relaxed-when / relaxed-level buckets.
 *  A person offered as `exact` is never also offered as relaxed.
 *
 *  Matching is same-city first. If nothing lines up in the user's city, we
 *  fall back to a city-agnostic pass so the demo pool always has room to
 *  produce a match. Real deployments would keep the hard city filter. */
export function findCandidatesTiered(
  mine: Intent,
  opts?: MatchOpts,
): {
  exact: Intent[];
  relaxedWhen: Intent[];
  relaxedLevel: Intent[];
} {
  const excluded = new Set(opts?.exclude ?? []);
  const excludedOwnersSet = excludedOwners(opts);
  const mineWhen: WhenTier | undefined = mine.whenAny
    ? undefined
    : slotToWhen(mine.day, mine.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;

  const build = (respectCity: boolean) => {
    const pool = [...seedPool(), ...loadMyIntents().filter((it) => it.id !== mine.id)]
      .filter(
        (it) =>
          it.ownerId !== mine.ownerId && !excluded.has(it.id) && !excludedOwnersSet.has(it.ownerId),
      )
      .filter((it) => (respectCity ? sameCity(mine, it) : true))
      .filter((it) => kindsCompatible(mine, it));

    const buckets: { exact: Intent[]; when: Intent[]; level: Intent[] } = {
      exact: [],
      when: [],
      level: [],
    };
    for (const it of pool) {
      const theirWhen: WhenTier = it.whenAny ? "any" : slotToWhen(it.day, it.window);
      const kind = mine.kind !== "other" ? mine.kind : it.kind;
      const theirLevel: LevelTier | undefined = it.levelAny ? undefined : it.level;
      const whenOk = whenCompatible(mineWhen, theirWhen);
      const levelOk = levelCompatible(kind, mineLevel, theirLevel ?? "intermediate");
      if (whenOk && levelOk) buckets.exact.push(it);
      else if (!whenOk && levelOk) buckets.when.push(it);
      else if (whenOk && !levelOk) buckets.level.push(it);
    }

    const finalize = (arr: Intent[], skipOwners: Set<string>) => {
      arr.sort((a, b) => score(mine, b) - score(mine, a));
      const seen = new Set<string>(skipOwners);
      const out: Intent[] = [];
      for (const it of arr) {
        if (seen.has(it.ownerId)) continue;
        seen.add(it.ownerId);
        out.push(it);
      }
      return out;
    };

    const exact = finalize(buckets.exact, new Set());
    const exactOwners = new Set(exact.map((i) => i.ownerId));
    const relaxedWhen = finalize(buckets.when, exactOwners);
    const relaxedOwners = new Set([...exactOwners, ...relaxedWhen.map((i) => i.ownerId)]);
    const relaxedLevel = finalize(buckets.level, relaxedOwners);
    return { exact, relaxedWhen, relaxedLevel };
  };

  const strict = build(true);
  if (strict.exact.length + strict.relaxedWhen.length + strict.relaxedLevel.length > 0) {
    return strict;
  }
  // No one in-city — widen so the demo pool can still surface a match.
  return build(false);
}

/** All exact-match partners (sorted best-first), one best intent per person. */
export function findAllMatches(mine: Intent, opts?: MatchOpts): Intent[] {
  return findCandidatesTiered(mine, opts).exact;
}

/** Look through seed pool + other users' intents for a compatible partner. */
export function findMatch(mine: Intent, opts?: MatchOpts): Intent | null {
  return findAllMatches(mine, opts)[0] ?? null;
}

/** Pick the next candidate to show — falls back to relaxed matches when the
 *  exact pool is exhausted so "See next" keeps producing people. */
export function pickNextCandidate(
  mine: Intent,
  opts?: MatchOpts,
): { intent: Intent; quality: MatchQuality } | null {
  const t = findCandidatesTiered(mine, opts);
  if (t.exact.length) return { intent: t.exact[0], quality: "exact" };
  if (t.relaxedWhen.length) return { intent: t.relaxedWhen[0], quality: "relaxed-when" };
  if (t.relaxedLevel.length) return { intent: t.relaxedLevel[0], quality: "relaxed-level" };
  return null;
}

/** Count remaining candidates across exact + relaxed buckets. */
export function countAvailableMatches(mine: Intent, opts?: MatchOpts): number {
  const t = findCandidatesTiered(mine, opts);
  return t.exact.length + t.relaxedWhen.length + t.relaxedLevel.length;
}

/** Same kind, but when/level don't line up — useful "you might want to shift" hints. */
export function findNearMisses(mine: Intent, opts?: MatchOpts): Intent[] {
  const excluded = new Set(opts?.exclude ?? []);
  const excludedOwnersSet = excludedOwners(opts);
  const mineWhen = slotToWhen(mine.day, mine.window);
  const seenOwners = new Set<string>();
  return seedPool()
    .filter(
      (it) =>
        it.ownerId !== mine.ownerId &&
        !excluded.has(it.id) &&
        !excludedOwnersSet.has(it.ownerId) &&
        sameCity(mine, it) &&
        kindsCompatible(mine, it),
    )
    .filter(
      (it) =>
        !whenCompatible(mineWhen, slotToWhen(it.day, it.window)) ||
        !levelCompatible(mine.kind !== "other" ? mine.kind : it.kind, mine.level, it.level),
    )
    .filter((it) => {
      if (seenOwners.has(it.ownerId)) return false;
      seenOwners.add(it.ownerId);
      return true;
    })
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
