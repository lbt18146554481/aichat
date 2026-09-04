import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { clearPeopleCache, setPeopleCache } from "@/lib/people-client";
import { TEST_PEOPLE_POOL } from "../fixtures/people-pool";
import { EMPTY } from "@/lib/agents/matchmaker";
import {
  advanceMatchmakerQueue,
  mergeRankedIds,
  matchPrefsFingerprint,
  retreatMatchmakerQueue,
} from "@/lib/matchmaker-queue";
import { EMPTY_HARD_FILTERS } from "@/lib/match-types";

describe("mergeRankedIds", () => {
  it("preserves LLM order and appends missing recall ids", () => {
    expect(mergeRankedIds(["b", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
});

describe("advanceMatchmakerQueue", () => {
  beforeEach(() => setPeopleCache(TEST_PEOPLE_POOL));
  afterEach(() => clearPeopleCache());

  it("pass adds to passedIds and moves to next in queue", () => {
    const base = {
      ...EMPTY,
      rankedQueue: ["isa", "leo", "june"],
      queueCursor: 0,
      currentPersonId: "isa",
      shownIds: ["isa"],
    };
    const next = advanceMatchmakerQueue(base, "pass", []);
    expect(next.passedIds).toContain("isa");
    expect(next.currentPersonId).toBe("leo");
    expect(next.queueCursor).toBe(1);
  });

  it("see advances without passing", () => {
    const base = {
      ...EMPTY,
      rankedQueue: ["isa", "leo"],
      queueCursor: 0,
      currentPersonId: "isa",
      shownIds: ["isa"],
    };
    const next = advanceMatchmakerQueue(base, "see", []);
    expect(next.passedIds).not.toContain("isa");
    expect(next.currentPersonId).toBe("leo");
  });
});

describe("retreatMatchmakerQueue", () => {
  beforeEach(() => setPeopleCache(TEST_PEOPLE_POOL));
  afterEach(() => clearPeopleCache());

  it("steps back to the previous person in queue", () => {
    const base = {
      ...EMPTY,
      rankedQueue: ["isa", "leo", "june"],
      queueCursor: 2,
      currentPersonId: "june",
      shownIds: ["isa", "leo", "june"],
    };
    const prev = retreatMatchmakerQueue(base, []);
    expect(prev.atStart).toBe(false);
    expect(prev.currentPersonId).toBe("leo");
    expect(prev.queueCursor).toBe(1);
  });

  it("returns atStart when already at the first person", () => {
    const base = {
      ...EMPTY,
      rankedQueue: ["isa", "leo"],
      queueCursor: 0,
      currentPersonId: "isa",
      shownIds: ["isa"],
    };
    const prev = retreatMatchmakerQueue(base, []);
    expect(prev.atStart).toBe(true);
    expect(prev.currentPersonId).toBe("isa");
  });
});

describe("matchPrefsFingerprint", () => {
  it("changes when filters change", () => {
    const a = matchPrefsFingerprint(EMPTY.understanding, EMPTY_HARD_FILTERS);
    const b = matchPrefsFingerprint(EMPTY.understanding, {
      ...EMPTY_HARD_FILTERS,
      cities: ["上海"],
    });
    expect(a).not.toBe(b);
  });
});
