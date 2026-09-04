import { describe, expect, it } from "vitest";
import {
  assessWishClarifyProgress,
  WISH_CLARIFY_MAX_ROUNDS,
} from "@/lib/wish-clarify";
import { EMPTY_BUDDY_HARD_FILTERS, EMPTY_WISH_HARD_FILTERS, emptyWishDraft } from "@/lib/wish-types";

const EMPTY_U = { positive: [], negative: [], notes: [] };
const profile = { city: "Beijing" } as import("@/lib/profile-shape").Profile;

describe("wish-clarify", () => {
  it("starts with open intake before structured fields", () => {
    const p = assessWishClarifyProgress({
      draft: emptyWishDraft(),
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history: [],
    });
    expect(p.focus).toBe("intake");
    expect(p.intakeDone).toBe(false);
    expect(p.activity).toBe("missing");
  });

  it("moves to structured follow-up after user describes wish", () => {
    const p = assessWishClarifyProgress({
      draft: emptyWishDraft(),
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history: [{ role: "user", content: "发布" }],
    });
    expect(p.focus).toBe("intake");
    expect(p.intakeDone).toBe(false);
  });

  it("treats rawText activity description as collected without kind", () => {
    const p = assessWishClarifyProgress({
      draft: { ...emptyWishDraft("这周末一起逛公园"), whenAny: true, levelAny: true },
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history: [{ role: "user", content: "这周末一起逛公园" }],
    });
    expect(p.activity).toBe("done");
    expect(p.intakeDone).toBe(true);
    expect(["whenWhere", "buddy", "confirm"]).toContain(p.focus);
  });

  it("moves to whenWhere after kind is set", () => {
    const p = assessWishClarifyProgress({
      draft: { ...emptyWishDraft("周末散步"), kind: "other", whenAny: true, levelAny: true },
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history: [{ role: "user", content: "想找户外散步" }],
    });
    expect(p.activity).toBe("done");
    expect(p.focus).toBe("whenWhere");
  });

  it("marks whenWhere done when weekend and location flexible", () => {
    const p = assessWishClarifyProgress({
      draft: {
        ...emptyWishDraft("周末轻松散步，地点都可以"),
        kind: "other",
        when: "weekend",
        whenAny: false,
        levelAny: true,
      },
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history: [
        { role: "user", content: "户外散步" },
        { role: "user", content: "周末，地点都可以" },
      ],
    });
    expect(p.whenWhere).toBe("done");
    expect(p.focus).toBe("buddy");
  });

  it("marks buddy done on explicit no preference", () => {
    const draft = {
      ...emptyWishDraft("周末散步"),
      kind: "other" as const,
      when: "weekend" as const,
      whenAny: false,
      levelAny: true,
    };
    const p = assessWishClarifyProgress({
      draft,
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history: [
        { role: "user", content: "散步" },
        { role: "user", content: "周末，都可以" },
        { role: "user", content: "对搭子没要求" },
      ],
    });
    expect(p.buddy).toBe("done");
    expect(p.allDone).toBe(true);
    expect(p.focus).toBe("confirm");
  });

  it("hits cap focus after max user turns", () => {
    const history = Array.from({ length: WISH_CLARIFY_MAX_ROUNDS }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    const p = assessWishClarifyProgress({
      draft: emptyWishDraft(),
      hardFilters: EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: EMPTY_BUDDY_HARD_FILTERS,
      understanding: EMPTY_U,
      profile,
      history,
    });
    expect(p.capReached).toBe(true);
    expect(p.focus).toBe("cap");
  });
});
