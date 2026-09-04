import { describe, expect, it } from "vitest";
import {
  countClarifyAssistantTurns,
  isClarifyCapReached,
  locationFlexible,
  matchmakerCoreHardFiltersSet,
  matchmakerIsAffirmation,
  matchmakerPrefsReady,
  matchmakerShouldSkipConfirm,
  matchmakerWantsImmediateMatch,
  MAX_CLARIFY_TURNS,
  type MatchmakerTurnInput,
} from "@/lib/matchmaker-llm.server";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";
import { EMPTY_PROFILE } from "@/lib/profile-shape";

function baseInput(partial: Partial<MatchmakerTurnInput> = {}): MatchmakerTurnInput {
  return {
    lang: "zh-CN",
    action: "message",
    history: [],
    understanding: { positive: [], negative: [], notes: [] },
    hardFilters: { ...EMPTY_HARD_FILTERS },
    currentPersonId: null,
    shownIds: [],
    passedIds: [],
    blockedPersonIds: [],
    profile: { ...EMPTY_PROFILE },
    pendingMatchConfirm: null,
    pendingRematchConfirm: null,
    rankedQueue: [],
    queueCursor: 0,
    queueFingerprint: null,
    ...partial,
  };
}

describe("matchmaker match confirm", () => {
  it("treats concrete prefs as ready", () => {
    expect(
      matchmakerPrefsReady(
        baseInput({
          hardFilters: { ...EMPTY_HARD_FILTERS, cities: ["上海"] },
        }),
      ),
    ).toBe(true);
  });

  it("skips confirm after someone was already shown", () => {
    expect(matchmakerShouldSkipConfirm(baseInput({ shownIds: ["p1"] }))).toBe(true);
  });

  it("skips confirm when user wants someone immediately", () => {
    expect(
      matchmakerShouldSkipConfirm(
        baseInput({ userMessage: "随便推一个吧" }),
      ),
    ).toBe(true);
  });

  it("does not treat preference flex as immediate match", () => {
    const history = [
      { role: "user" as const, content: "北京男生30岁以下" },
      { role: "assistant" as const, content: "性格有什么偏好吗？" },
      { role: "user" as const, content: "性格都行" },
      { role: "assistant" as const, content: "年龄 20 出头也可以吗？" },
    ];
    expect(matchmakerWantsImmediateMatch(baseInput({ userMessage: "都行", history }))).toBe(false);
    expect(
      matchmakerShouldSkipConfirm(baseInput({ userMessage: "都行", history })),
    ).toBe(false);
    expect(
      matchmakerShouldSkipConfirm(
        baseInput({ userMessage: "性格都行", history: history.slice(0, 2) }),
      ),
    ).toBe(false);
  });

  it("still skips confirm for explicit start-now phrases", () => {
    expect(matchmakerWantsImmediateMatch(baseInput({ userMessage: "随便推一个吧" }))).toBe(true);
    expect(matchmakerWantsImmediateMatch(baseInput({ userMessage: "别问了，你找吧" }))).toBe(true);
  });

  it("recognizes match affirmation phrases", () => {
    expect(matchmakerIsAffirmation("没有了，开始找吧", "message")).toBe(true);
    expect(matchmakerIsAffirmation("好的你找吧", "message")).toBe(true);
    expect(matchmakerIsAffirmation("", "confirm_match")).toBe(true);
    expect(matchmakerIsAffirmation("随便找一个", "message")).toBe(true);
    expect(matchmakerIsAffirmation("最好也喜欢徒步", "message")).toBe(false);
  });

  it("core hard filters need gender, city, and age", () => {
    expect(matchmakerCoreHardFiltersSet(EMPTY_HARD_FILTERS)).toBe(false);
    expect(
      matchmakerCoreHardFiltersSet({
        ...EMPTY_HARD_FILTERS,
        genders: ["female"],
        cities: ["shanghai"],
        ageMin: 25,
      }),
    ).toBe(true);
    expect(
      matchmakerCoreHardFiltersSet({
        ...EMPTY_HARD_FILTERS,
        genders: ["female"],
        cities: ["shanghai"],
      }),
    ).toBe(false);
  });

  it("treats location-flexible notes as satisfying city", () => {
    const u = { positive: [], negative: [], notes: ["其他城市也可以"] };
    expect(locationFlexible(u)).toBe(true);
    expect(
      matchmakerCoreHardFiltersSet(
        { ...EMPTY_HARD_FILTERS, genders: ["female"], ageMax: 30 },
        u,
      ),
    ).toBe(true);
  });

  it("counts clarify assistant turns before first intro", () => {
    const history = Array.from({ length: MAX_CLARIFY_TURNS }, (_, i) => ({
      role: "assistant" as const,
      content: `追问 ${i + 1}`,
    }));
    expect(countClarifyAssistantTurns(baseInput({ history }))).toBe(MAX_CLARIFY_TURNS);
    expect(isClarifyCapReached(baseInput({ history }))).toBe(true);
    expect(isClarifyCapReached(baseInput({ history, shownIds: ["isa"] }))).toBe(false);
  });
});
