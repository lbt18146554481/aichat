import type { ToolDefinition } from "./llm.server";
import type { SideLang, WishDraft, WishHardFilters } from "./wish-types";
import {
  formatDateRangeLine,
  formatNowContext,
  intentDateRange,
  normalizeIsoDate,
  normalizeTimeHHmm,
  resolveDraftDates,
} from "./wish-date";
import { EMPTY_WISH_HARD_FILTERS, EMPTY_BUDDY_HARD_FILTERS, emptyWishDraft } from "./wish-types";
import type { BuddyHardFilters } from "./buddy-filters";
import { normalizeBuddyHardFilters } from "./buddy-filters";
import { normalizeGender } from "./match-normalize";
import type { PersonGender } from "./types";
import type { UserUnderstanding } from "./understanding";
import type { ActivityKind } from "./types";
import type { LevelTier, WhenTier, Intent } from "./intents";
import { getIntentById } from "./intents";
import { normalizeCityList } from "./match-normalize";
import { formatPlaceList, parsePlaceList } from "./geo";
import {
  recallWishWithRelaxation,
  rosterFromIntentIds,
  WISH_RECALL_LIMIT,
} from "./wish-recall";

const KINDS: ActivityKind[] = [
  "tennis",
  "run",
  "climb",
  "cook",
  "exhibition",
  "bookstore",
  "other",
];
const WHENS: WhenTier[] = ["weekend", "weeknight", "any"];
const LEVELS: LevelTier[] = ["beginner", "intermediate", "advanced"];

export type SideToolState = {
  lang: SideLang;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  understanding: UserUnderstanding;
  wishDraft: WishDraft;
  pendingConfirm: string | null;
  myIntentId: string | null;
  matchIntentId: string | null;
  triedIntentIds: string[];
  triedOwnerIds: string[];
  filtersTouched: boolean;
  buddyFiltersTouched: boolean;
  draftTouched: boolean;
  /** Tool requested publish after user intent is clear. */
  affirmPublish: boolean;
  suggestedMatchId: string | null;
  lastSearchIds: string[];
};

export function createSideToolState(input: {
  lang: SideLang;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  understanding: UserUnderstanding;
  wishDraft: WishDraft;
  pendingConfirm: string | null;
  myIntentId: string | null;
  matchIntentId: string | null;
  triedIntentIds: string[];
  triedOwnerIds: string[];
}): SideToolState {
  return {
    lang: input.lang,
    hardFilters: {
      cities: [...input.hardFilters.cities],
      excludeCities: [...input.hardFilters.excludeCities],
      kinds: [...input.hardFilters.kinds],
      allowCrossCity: input.hardFilters.allowCrossCity,
    },
    buddyHardFilters: { ...input.buddyHardFilters },
    understanding: input.understanding,
    wishDraft: { ...input.wishDraft },
    pendingConfirm: input.pendingConfirm,
    myIntentId: input.myIntentId,
    matchIntentId: input.matchIntentId,
    triedIntentIds: [...input.triedIntentIds],
    triedOwnerIds: [...input.triedOwnerIds],
    filtersTouched: false,
    buddyFiltersTouched: false,
    draftTouched: false,
    affirmPublish: false,
    suggestedMatchId: null,
    lastSearchIds: [],
  };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

function parseKind(v: unknown): ActivityKind | null {
  const s = String(v ?? "");
  return KINDS.includes(s as ActivityKind) ? (s as ActivityKind) : null;
}

function parseWhen(v: unknown): WhenTier | undefined {
  const s = String(v ?? "");
  return WHENS.includes(s as WhenTier) ? (s as WhenTier) : undefined;
}

function parseLevel(v: unknown): LevelTier | undefined {
  const s = String(v ?? "");
  return LEVELS.includes(s as LevelTier) ? (s as LevelTier) : undefined;
}

function draftAsMine(state: SideToolState, ownerCity = ""): Intent {
  const d = state.wishDraft;
  const city = d.city || ownerCity;
  const cityZh = d.city_zh || d.city || ownerCity;
  const dates = resolveDraftDates(d);
  return {
    id: state.myIntentId ?? "draft-preview",
    // Published wishes use ownerId "me"; drafts must not, or browse recall excludes the whole pool.
    ownerId: state.myIntentId ? "me" : "draft-browse",
    ownerName: "You",
    ownerName_zh: "你",
    ownerCity: city,
    ownerCity_zh: cityZh,
    kind: d.kind ?? "other",
    day: "sat",
    window: "evening",
    whenAny: d.whenAny || d.when === "any" || !d.when,
    level: d.level ?? "intermediate",
    levelAny: d.levelAny || !d.level,
    city,
    city_zh: cityZh,
    venue: "",
    venue_zh: "",
    rawText: d.rawText || "",
    rawText_zh: d.rawText || "",
    status: "active",
    strictWhen: d.strictWhen ?? false,
    strictLevel: d.strictLevel ?? false,
    allowCrossCity: d.allowCrossCity ?? state.hardFilters.allowCrossCity ?? false,
    ...dates,
    createdAt: Date.now(),
  };
}

function previewMatches(state: SideToolState, limit = WISH_RECALL_LIMIT) {
  if (!state.myIntentId && !state.wishDraft.kind) {
    return {
      published: false,
      count: 0,
      empty: true,
      tip:
        state.lang === "zh-CN"
          ? "还没有可匹配的心愿草稿（缺活动类型）。"
          : "No wish draft ready (missing activity kind).",
      candidates: [] as Array<Record<string, unknown>>,
      crossCityUsed: false,
    };
  }

  const mine = state.myIntentId
    ? getIntentById(state.myIntentId)
    : draftAsMine(state);
  if (!mine) {
    return {
      published: Boolean(state.myIntentId),
      count: 0,
      empty: true,
      tip: "Wish not found",
      candidates: [] as Array<Record<string, unknown>>,
      crossCityUsed: false,
    };
  }

  const recall = recallWishWithRelaxation({
    mine,
    hardFilters: state.hardFilters,
    buddyHardFilters: state.buddyHardFilters,
    understanding: state.understanding,
    exclude: state.triedIntentIds,
    excludeOwnerIds: state.triedOwnerIds,
    shownIds: state.triedIntentIds,
    passedIds: state.triedIntentIds,
    limit,
  }, state.lang);

  const candidates = recall.candidates.map((c) => {
    const it = getIntentById(c.id);
    return {
      id: c.id,
      score: c.score,
      quality: c.quality,
      crossCity: c.crossCity,
      owner: state.lang === "zh-CN" ? it?.ownerName_zh : it?.ownerName,
      city: state.lang === "zh-CN" ? it?.city_zh || it?.ownerCity_zh : it?.city || it?.ownerCity,
      kind: it?.kind,
      raw: state.lang === "zh-CN" ? it?.rawText_zh || it?.rawText : it?.rawText,
    };
  });

  return {
    published: Boolean(state.myIntentId),
    count: candidates.length,
    empty: candidates.length === 0,
    sameCityEmpty: recall.sameCityEmpty,
    crossCityUsed: recall.crossCityUsed,
    nearMissIds: recall.nearMissIds,
    filtersRelaxed: recall.filtersRelaxed,
    relaxHints: recall.relaxHints,
    candidates,
    roster: rosterFromIntentIds(
      candidates.map((c) => c.id),
      state.lang,
      new Set(state.triedIntentIds),
    ),
  };
}

export const SIDE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "update_wish_draft",
      description:
        "Update the in-progress wish (activity kind, when, level, city, rawText). Call when the user clarifies what they want to do.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: ["string", "null"] },
          when: { type: ["string", "null"] },
          level: { type: ["string", "null"] },
          city: { type: "string" },
          city_zh: { type: "string" },
          rawText: { type: "string" },
          whenAny: { type: "boolean" },
          levelAny: { type: "boolean" },
          strictWhen: { type: "boolean" },
          strictLevel: { type: "boolean" },
          allowCrossCity: { type: "boolean" },
          dateStart: { type: ["string", "null"], description: "ISO YYYY-MM-DD inclusive start" },
          dateEnd: { type: ["string", "null"], description: "ISO YYYY-MM-DD inclusive end" },
          timeStart: { type: ["string", "null"], description: "HH:mm local start time" },
          timeEnd: { type: ["string", "null"], description: "HH:mm local end time" },
          clear: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_wish_filters",
      description:
        "Update hard filters for wish matching (cities / excludeCities / kinds / buddy demographics). Place aliases CN/EN ok.",
      parameters: {
        type: "object",
        properties: {
          cities: { type: "array", items: { type: "string" } },
          excludeCities: { type: "array", items: { type: "string" } },
          kinds: { type: "array", items: { type: "string" } },
          allowCrossCity: { type: "boolean" },
          genders: { type: "array", items: { type: "string" } },
          excludeGenders: { type: "array", items: { type: "string" } },
          ageMin: { type: ["number", "null"] },
          ageMax: { type: ["number", "null"] },
          clear: { type: "boolean" },
          clearBuddy: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_wish_matches",
      description:
        "Preview how many wishes would match the current draft or published wish before promising a match.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_wishes",
      description: "Ranked recall of compatible wishes. Returns ids you may pick as pickMatchIntentId.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_publish_wish",
      description:
        "Set confirmLine text to prefill the publish form when the draft is ready. Does NOT publish — the user must tap Publish on the form.",
      parameters: {
        type: "object",
        properties: {
          confirmLine: {
            type: "string",
            description: "Optional one-line recap of the wish",
          },
        },
      },
    },
  },
];

export function executeSideTool(
  state: SideToolState,
  name: string,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "update_wish_draft": {
      if (args.clear === true) {
        state.wishDraft = emptyWishDraft();
        state.draftTouched = true;
        return { ok: true, wishDraft: state.wishDraft };
      }
      const d = { ...state.wishDraft };
      if ("kind" in args) d.kind = args.kind === null ? null : parseKind(args.kind);
      if ("when" in args) {
        if (args.when === null) {
          d.when = undefined;
          d.whenAny = true;
        } else {
          const w = parseWhen(args.when);
          if (w) {
            d.when = w;
            d.whenAny = w === "any";
          }
        }
      }
      if ("level" in args) {
        if (args.level === null) {
          d.level = undefined;
          d.levelAny = true;
        } else {
          const lv = parseLevel(args.level);
          if (lv) {
            d.level = lv;
            d.levelAny = false;
          }
        }
      }
      if (typeof args.whenAny === "boolean") d.whenAny = args.whenAny;
      if (typeof args.levelAny === "boolean") d.levelAny = args.levelAny;
      if (typeof args.strictWhen === "boolean") d.strictWhen = args.strictWhen;
      if (typeof args.strictLevel === "boolean") d.strictLevel = args.strictLevel;
      if (typeof args.allowCrossCity === "boolean") d.allowCrossCity = args.allowCrossCity;
      if ("dateStart" in args) {
        d.dateStart =
          args.dateStart === null ? undefined : normalizeIsoDate(String(args.dateStart ?? ""));
      }
      if ("dateEnd" in args) {
        d.dateEnd = args.dateEnd === null ? undefined : normalizeIsoDate(String(args.dateEnd ?? ""));
      }
      if ("timeStart" in args) {
        d.timeStart =
          args.timeStart === null ? undefined : normalizeTimeHHmm(String(args.timeStart ?? ""));
      }
      if ("timeEnd" in args) {
        d.timeEnd = args.timeEnd === null ? undefined : normalizeTimeHHmm(String(args.timeEnd ?? ""));
      }
      if (typeof args.city === "string") d.city = args.city;
      if (typeof args.city_zh === "string") d.city_zh = args.city_zh;
      if (typeof args.rawText === "string") d.rawText = args.rawText;
      const dates = resolveDraftDates(d);
      if (dates.dateStart) {
        d.dateStart = dates.dateStart;
        d.dateEnd = dates.dateEnd;
      }
      if (dates.timeStart) d.timeStart = dates.timeStart;
      if (dates.timeEnd) d.timeEnd = dates.timeEnd;
      state.wishDraft = d;
      state.draftTouched = true;
      return { ok: true, wishDraft: state.wishDraft };
    }
    case "update_wish_filters": {
      if (args.clear === true) {
        state.hardFilters = { ...EMPTY_WISH_HARD_FILTERS };
      } else {
        if ("cities" in args) {
          state.hardFilters.cities = normalizeCityList(asStringArray(args.cities));
        }
        if ("excludeCities" in args) {
          state.hardFilters.excludeCities = normalizeCityList(asStringArray(args.excludeCities));
        }
        if ("kinds" in args) {
          state.hardFilters.kinds = asStringArray(args.kinds)
            .map(parseKind)
            .filter((k): k is ActivityKind => Boolean(k));
        }
        if (typeof args.allowCrossCity === "boolean") {
          state.hardFilters.allowCrossCity = args.allowCrossCity;
        }
      }
      if (args.clearBuddy === true) {
        state.buddyHardFilters = { ...EMPTY_BUDDY_HARD_FILTERS };
        state.buddyFiltersTouched = true;
      } else {
        const buddyPatch: Partial<BuddyHardFilters> = {};
        if ("genders" in args) {
          buddyPatch.genders = asStringArray(args.genders)
            .map((g) => normalizeGender(g))
            .filter((g): g is PersonGender => Boolean(g));
        }
        if ("excludeGenders" in args) {
          buddyPatch.excludeGenders = asStringArray(args.excludeGenders)
            .map((g) => normalizeGender(g))
            .filter((g): g is PersonGender => Boolean(g));
        }
        if ("ageMin" in args) {
          buddyPatch.ageMin =
            args.ageMin === null ? null : typeof args.ageMin === "number" ? args.ageMin : null;
        }
        if ("ageMax" in args) {
          buddyPatch.ageMax =
            args.ageMax === null ? null : typeof args.ageMax === "number" ? args.ageMax : null;
        }
        if (Object.keys(buddyPatch).length > 0) {
          state.buddyHardFilters = normalizeBuddyHardFilters(state.buddyHardFilters, buddyPatch);
          state.buddyFiltersTouched = true;
        }
      }
      state.filtersTouched = true;
      return {
        ok: true,
        hardFilters: state.hardFilters,
        buddyHardFilters: state.buddyHardFilters,
        locationLabel: formatPlaceList(parsePlaceList(state.hardFilters.cities), state.lang),
      };
    }
    case "preview_wish_matches": {
      const limit =
        typeof args.limit === "number" ? Math.min(12, Math.max(1, args.limit)) : WISH_RECALL_LIMIT;
      return previewMatches(state, limit);
    }
    case "search_wishes": {
      const limit =
        typeof args.limit === "number" ? Math.min(12, Math.max(1, args.limit)) : WISH_RECALL_LIMIT;
      const preview = previewMatches(state, limit);
      state.lastSearchIds = preview.candidates.map((c) => String(c.id));
      state.suggestedMatchId = state.lastSearchIds[0] ?? null;
      return preview;
    }
    case "confirm_publish_wish": {
      if (typeof args.confirmLine === "string" && args.confirmLine.trim()) {
        state.pendingConfirm = args.confirmLine.trim();
      }
      return {
        ok: true,
        pendingConfirm: state.pendingConfirm,
        draft: state.wishDraft,
        tip:
          state.lang === "zh-CN"
            ? "已写入表单预填文案；用户必须在表单里点「发布」才会挂上心愿。"
            : "Form prefill updated; wish goes live only when the user taps Publish on the form.",
      };
    }
    default:
      return { error: `unknown_tool:${name}` };
  }
}

export function sideToolSystem(state: SideToolState): string {
  const zh = state.lang === "zh-CN";
  const d = state.wishDraft;
  const dates = formatDateRangeLine(
    intentDateRange({ dateStart: d.dateStart, dateEnd: d.dateEnd } as Intent),
    state.lang,
  );
  return [
    formatNowContext(state.lang),
    zh
      ? `你是 Side by Side 的工具规划助手。需要时调用工具：
- 用户说清活动/时间/水平/城市 → update_wish_draft（相对日期如「这周末」请算出 dateStart/dateEnd）
- 改匹配地点或活动类型过滤 → update_wish_filters
- 问大概能配上几个 / 发布前预览 → preview_wish_matches
- 已发布要找人 → search_wishes
- 信息够清楚、可展示发布表单 → confirm_publish_wish（只写 confirmLine 预填，不发布；用户必须点表单发布）
不需要则不调用。不要输出最终聊天 JSON。
草稿：kind=${d.kind ?? "?"} when=${d.whenAny ? "any" : d.when ?? "?"} ${dates} level=${d.levelAny ? "any" : d.level ?? "?"} published=${state.myIntentId ?? "no"}`
      : `You plan Side by Side tools. Call when needed:
- clarify activity/when/level/city → update_wish_draft (resolve relative dates to dateStart/dateEnd)
- location/kind filters → update_wish_filters
- how many matches / pre-publish check → preview_wish_matches
- find matches after publish → search_wishes
- draft ready for form → confirm_publish_wish (confirmLine prefill only; user must tap Publish on form)
If none needed, call none. Do not output final chat JSON yet.
Draft: kind=${d.kind ?? "?"} when=${d.whenAny ? "any" : d.when ?? "?"} ${dates} level=${d.levelAny ? "any" : d.level ?? "?"} published=${state.myIntentId ?? "no"}`,
  ].join("\n\n");
}
