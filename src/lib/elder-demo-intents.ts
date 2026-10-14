import type { Intent } from "./intents";

/** Public demo wishes for the elder group-activity pool. */
export const ELDER_THEMES = [
  "喝茶",
  "散步",
  "唱粤曲",
  "棋牌",
  "逛公园",
  "行山",
  "太极",
  "书法",
] as const;

export type ElderTheme = (typeof ELDER_THEMES)[number];
export type ElderPace = "轻松" | "一般";
export type ElderCost = "免费" | "AA" | "各自付费";
export type ElderHeadcount = "就我加一位" | "3到5人" | "不限";

interface ElderSeed {
  slug: string;
  ownerName: string;
  theme: ElderTheme;
  whenLabel: string;
  day: Intent["day"];
  window: Intent["window"];
  place: string;
  headcount: ElderHeadcount;
  pace: ElderPace;
  cost: ElderCost;
  note: string;
  raw: string;
}

const ROWS: ElderSeed[] = [
  {
    slug: "kowloon-walk",
    ownerName: "陈姨",
    theme: "散步",
    whenLabel: "周六上午",
    day: "sat",
    window: "morning",
    place: "九龙公园",
    headcount: "3到5人",
    pace: "轻松",
    cost: "免费",
    note: "想多两位老友，走得慢也没关系。",
    raw: "周六早上在九龙公园慢行，想多两位老友。",
  },
  {
    slug: "tea-chat",
    ownerName: "李伯",
    theme: "喝茶",
    whenLabel: "周三下午",
    day: "wed",
    window: "midday",
    place: "社区中心",
    headcount: "3到5人",
    pace: "轻松",
    cost: "AA",
    note: "倾偈为主，不赶时间。",
    raw: "周三下午社区中心喝茶倾偈。",
  },
  {
    slug: "cantonese-opera",
    ownerName: "张姨",
    theme: "唱粤曲",
    whenLabel: "周日下午",
    day: "sun",
    window: "midday",
    place: "社区活动室",
    headcount: "不限",
    pace: "轻松",
    cost: "免费",
    note: "新手都欢迎，跟唱就好。",
    raw: "周日下午唱粤曲，新手都欢迎。",
  },
  {
    slug: "taichi",
    ownerName: "王叔",
    theme: "太极",
    whenLabel: "周二上午",
    day: "tue",
    window: "morning",
    place: "维园",
    headcount: "不限",
    pace: "轻松",
    cost: "免费",
    note: "动作慢，站着坐着都行。",
    raw: "周二上午维园打太极，动作慢。",
  },
  {
    slug: "mahjong",
    ownerName: "何姨",
    theme: "棋牌",
    whenLabel: "周五下午",
    day: "fri",
    window: "midday",
    place: "楼下会所",
    headcount: "就我加一位",
    pace: "一般",
    cost: "免费",
    note: "三缺一，不赌钱。",
    raw: "周五下午棋牌，三缺一，不赌钱。",
  },
  {
    slug: "hike",
    ownerName: "周伯",
    theme: "行山",
    whenLabel: "周六上午",
    day: "sat",
    window: "morning",
    place: "龙虎山",
    headcount: "3到5人",
    pace: "轻松",
    cost: "免费",
    note: "平路为主，中途可以休息。",
    raw: "周六行山，轻松路线，平路为主。",
  },
  {
    slug: "park-flowers",
    ownerName: "林姨",
    theme: "逛公园",
    whenLabel: "周日上午",
    day: "sun",
    window: "morning",
    place: "香港公园",
    headcount: "就我加一位",
    pace: "轻松",
    cost: "免费",
    note: "看看花，拍拍照。",
    raw: "周日上午逛香港公园看花。",
  },
  {
    slug: "calligraphy",
    ownerName: "吴叔",
    theme: "书法",
    whenLabel: "周四下午",
    day: "thu",
    window: "midday",
    place: "长者中心",
    headcount: "3到5人",
    pace: "轻松",
    cost: "免费",
    note: "带自己的笔也行，中心有纸。",
    raw: "周四下午长者中心一起写书法。",
  },
  {
    slug: "seaside-walk",
    ownerName: "黄姨",
    theme: "散步",
    whenLabel: "周一上午",
    day: "mon",
    window: "morning",
    place: "尖东海旁",
    headcount: "就我加一位",
    pace: "轻松",
    cost: "免费",
    note: "吹吹风，走一段就坐。",
    raw: "周一早上海边散步，走一段就坐。",
  },
  {
    slug: "opera-evening",
    ownerName: "梁伯",
    theme: "唱粤曲",
    whenLabel: "周三傍晚",
    day: "wed",
    window: "evening",
    place: "街坊会",
    headcount: "3到5人",
    pace: "一般",
    cost: "AA",
    note: "会几句就行，唱完饮茶。",
    raw: "周三傍晚街坊会唱粤曲，唱完可以饮茶。",
  },
  {
    slug: "dimsum",
    ownerName: "马姨",
    theme: "喝茶",
    whenLabel: "周六下午",
    day: "sat",
    window: "midday",
    place: "油麻地茶楼",
    headcount: "3到5人",
    pace: "轻松",
    cost: "AA",
    note: "点心各付各的。",
    raw: "周六下午油麻地茶楼饮茶，点心各付各的。",
  },
  {
    slug: "chess",
    ownerName: "郑叔",
    theme: "棋牌",
    whenLabel: "周日下午",
    day: "sun",
    window: "midday",
    place: "公园凉亭",
    headcount: "就我加一位",
    pace: "一般",
    cost: "免费",
    note: "下象棋，不赌钱。",
    raw: "周日下午公园凉亭下象棋，不赌钱。",
  },
];

export function elderDemoIntents(): Intent[] {
  const base = Date.UTC(2026, 8, 1);
  return ROWS.map((row, index) => ({
    id: `elder:${row.slug}`,
    ownerId: `elder-owner:${row.slug}`,
    ownerName: row.ownerName,
    ownerName_zh: row.ownerName,
    ownerCity: "Hong Kong",
    ownerCity_zh: "香港",
    city: "Hong Kong",
    city_zh: "香港",
    kind: "other",
    activityCore: row.theme,
    activityStrength: "flex",
    level: "beginner",
    levelAny: true,
    day: row.day,
    window: row.window,
    venue: row.place,
    venue_zh: row.place,
    rawText: row.raw,
    rawText_zh: row.raw,
    whenAny: false,
    status: "active",
    placeRaw: row.place,
    placeMode: "any",
    activityDescRaw: row.raw,
    otherReqRaw: row.note,
    elderTheme: row.theme,
    headcount: row.headcount,
    pace: row.pace,
    cost: row.cost,
    whenLabel: row.whenLabel,
    createdAt: base + index * 3_600_000,
  }));
}

export function isElderPoolIntent(intent: Pick<Intent, "id" | "elderTheme" | "ownerId">): boolean {
  return Boolean(intent.elderTheme) || intent.id.startsWith("elder:") || intent.ownerId === "me";
}
