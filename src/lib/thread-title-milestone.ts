import { generateThreadTitleFn } from "./api/data.functions";
import { updateSession, type SessionAgent } from "./sessions";
import { deriveThreadTitle, sanitizeUserSeed } from "./thread-title";

/** Tier-0/1 title when creating or handoffing a session. */
export function seedForNewSession(opts: {
  summary?: string | null;
  userText?: string | null;
  userMessages?: string[];
}): string {
  return deriveThreadTitle(opts) || sanitizeUserSeed(opts.userText ?? "") || "";
}

/**
 * Milestone (tier-2): LLM title after prefs clear / wish published.
 * Fire-and-forget; marks titleMilestoneDone on success.
 */
export function refreshMilestoneThreadTitle(opts: {
  sessionId: string;
  lang: "en" | "zh-CN";
  agent: SessionAgent;
  context: string;
  onDone: () => void;
}): void {
  void (async () => {
    try {
      const title = await generateThreadTitleFn({
        data: {
          lang: opts.lang,
          agent: opts.agent,
          context: opts.context,
        },
      });
      if (title?.trim()) {
        updateSession(opts.sessionId, { seed: title.trim() });
      }
      opts.onDone();
    } catch (e) {
      console.warn("[thread-title milestone]", e);
    }
  })();
}
