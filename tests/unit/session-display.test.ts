import { describe, expect, it } from "vitest";
import { sessionAgentLabel, sessionExitLabel } from "@/lib/session-display";
import type { Session } from "@/lib/sessions";

const t = (key: string) => key;

function sess(partial: Partial<Session> & Pick<Session, "agent">): Session {
  return {
    id: "s1",
    threadId: "t1",
    createdAt: 0,
    updatedAt: 0,
    seed: "test",
    status: "waiting",
    state: {},
    ...partial,
  };
}

describe("session-display", () => {
  it("labels side-by-side agent", () => {
    expect(sessionAgentLabel("do_something", t)).toBe("history.agent_sidebyside");
  });

  it("labels matchmaker agent", () => {
    expect(sessionAgentLabel("introduce", t)).toBe("history.agent_matchmaker");
  });

  it("shows drafting for side-by-side prompt", () => {
    expect(
      sessionExitLabel(
        sess({
          agent: "do_something",
          state: { stage: "prompt", myIntentId: null, messages: [{ id: "1", role: "user", text: "hi", t: 0 }] },
        }),
        t,
      ),
    ).toBe("history.exit_sidebyside_drafting");
  });

  it("shows matched for side-by-side with buddy", () => {
    expect(
      sessionExitLabel(
        sess({
          agent: "do_something",
          state: { stage: "published", myIntentId: "me:1", matchIntentId: "other:1" },
        }),
        t,
      ),
    ).toBe("history.exit_sidebyside_matched");
  });

  it("shows matchmaker searching vs matched", () => {
    expect(sessionExitLabel(sess({ agent: "introduce", state: {} }), t)).toBe(
      "history.exit_matchmaker_searching",
    );
    expect(
      sessionExitLabel(sess({ agent: "introduce", state: { currentPersonId: "june" } }), t),
    ).toBe("history.exit_matchmaker_matched");
  });
});
