import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useEffect, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { normalizeLang } from "@/lib/lang";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { IntroCanvas } from "@/components/canvas/intro-canvas";
import { consumeFocusPerson, consumeSeed } from "@/lib/seed";
import {
  EMPTY,
  advanceQueueSilent,
  applyTurnResult,
  appendUserMessage,
  beginAssistantStream,
  canRetreatQueue,
  focusPerson,
  load,
  patchLastAssistant,
  retreatQueueSilent,
  save,
  sessionNeedsBootStart,
  suggestChips,
  type MatchmakerState,
} from "@/lib/agents/matchmaker";
import { requestMatchmakerTurn } from "@/lib/matchmaker-client";
import { listBlocked } from "@/lib/blocklist";
import type { MatchmakerTurnAction } from "@/lib/matchmaker-llm.server";
import type { HandoffContext } from "@/lib/handoff";
import {
  graftFromMatchmaker,
  openSideBySideFromHandoff,
} from "@/lib/session-handoff";
import { clearActiveThreadId } from "@/lib/active-thread";
import { useSessions } from "@/data/hooks";
import { refreshMilestoneThreadTitle } from "@/lib/thread-title-milestone";
import {
  buildMatchmakerTitleContext,
  matchmakerTitleMilestoneReady,
} from "@/lib/thread-title";

export const Route = createFileRoute("/matchmaker")({
  validateSearch: (raw: Record<string, unknown>) => ({
    session: typeof raw.session === "string" ? raw.session : "",
    focus: typeof raw.focus === "string" ? raw.focus : "",
  }),
  component: MatchmakerPage,
  head: () => ({
    meta: [
      { title: "认识新朋友 — Maitri" },
      {
        name: "description",
        content: "描述你想找的人。每次只引荐一个人，并告诉你为什么是 TA。",
      },
    ],
  }),
});

function MatchmakerPage() {
  const { ready } = useRequireAuth();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const sessionId = search.session || null;
  const focusPersonId = search.focus || "";

  useEffect(() => {
    if (ready && !sessionId) void navigate({ to: "/" });
  }, [ready, sessionId, navigate]);

  const [pendingSeed, setPendingSeed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return consumeSeed("matchmaker");
  });

  const [state, setState] = useState<MatchmakerState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const stateRef = useRef(state);
  const bootedRef = useRef(false);
  stateRef.current = state;
  const { isFetched: sessionsReady } = useSessions();

  useEffect(() => {
    if (!sessionId || !sessionsReady) {
      setSessionReady(false);
      return;
    }
    bootedRef.current = false;
    const loaded = load(sessionId);
    const focusId = consumeFocusPerson();
    setState(focusId ? focusPerson(loaded, focusId) : loaded);
    setSessionReady(true);
  }, [sessionId, sessionsReady]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && sessionReady && sessionId) save(state, sessionId);
  }, [state, hydrated, sessionReady, sessionId]);

  // Deep-link from Saved drawer / connections: focus a person even when already on this session.
  useEffect(() => {
    if (!hydrated || !sessionReady || !focusPersonId) return;
    setState((s) => focusPerson(s, focusPersonId));
    void navigate({
      to: "/matchmaker",
      search: { session: sessionId ?? "", focus: "" },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionReady, focusPersonId]);

  const tryMilestoneTitle = useCallback(
    (cur: MatchmakerState) => {
      if (!sessionId || cur.titleMilestoneDone) return;
      if (!matchmakerTitleMilestoneReady(cur.understanding, cur.hardFilters)) return;
      refreshMilestoneThreadTitle({
        sessionId,
        lang,
        agent: "introduce",
        context: buildMatchmakerTitleContext(
          lang,
          cur.understanding,
          cur.hardFilters,
          cur.messages,
        ),
        onDone: () => {
          setState((s) => {
            const next = { ...s, titleMilestoneDone: true };
            stateRef.current = next;
            return next;
          });
        },
      });
    },
    [lang, sessionId],
  );

  const navigateHandoffToSide = useCallback(
    (opts: {
      userMessage: string;
      summary: string;
      transitionReply: string;
      understanding: MatchmakerState["understanding"];
      graftedExtraUser?: string;
    }) => {
      if (!sessionId) return;
      const cur = stateRef.current;
      const handoff: HandoffContext = {
        from: "matchmaker",
        parentSessionId: sessionId,
        seed: opts.userMessage,
        summary: opts.summary || opts.userMessage,
        understanding: opts.understanding,
        sideBySideHints: { activity: opts.summary || opts.userMessage },
        graftedMessages: graftFromMatchmaker(cur, opts.graftedExtraUser),
        handoffCount: (cur.handoffCount ?? 0) + 1,
        transitionReply: opts.transitionReply?.trim() || "",
      };
      save({ ...cur, suspended: true }, sessionId);
      const next = openSideBySideFromHandoff(handoff, sessionId);
      void navigate({ to: "/side-by-side", search: { session: next.id, chatWith: "" } });
    },
    [lang, navigate, sessionId],
  );

  const withRematchConfirmAsk = (next: MatchmakerState): MatchmakerState => {
    // Rematch consent is handled in chat — user confirms with natural language (好的/重新找吧).
    return next;
  };

  const withMatchConfirmAsk = (next: MatchmakerState): MatchmakerState => {
    // First-match consent is handled in chat (reply + suggestion chips + verbal affirm).
    // No extra inline card — it duplicated "好的，开始找吧" and confused users.
    return next;
  };

  const runTurn = useCallback(
    async (opts: {
      action: MatchmakerTurnAction;
      userMessage?: string;
      userTextForState?: string | null;
      seed?: string;
    }) => {
      const userText = opts.userTextForState ?? opts.userMessage ?? null;
      const userAlreadyShown = Boolean(userText?.trim());
      let staged = stateRef.current;
      if (userAlreadyShown) {
        staged = appendUserMessage(staged, userText!);
        staged = { ...staged, suggestions: [] };
        stateRef.current = staged;
        setState(staged);
      }
      setThinking(true);
      let streaming = false;
      try {
        const output = await requestMatchmakerTurn({
          lang,
          action: opts.action,
          userMessage: opts.userMessage,
          seed: opts.seed,
          state: staged,
          onDelta: (text) => {
            flushSync(() => {
              if (!streaming) {
                streaming = true;
                setState((s) => beginAssistantStream(s));
                setThinking(false);
              }
              setState((s) => patchLastAssistant(s, text));
            });
          },
          onReady: ({ reply, suggestions }) => {
            flushSync(() => {
              if (!streaming) {
                streaming = true;
                setState((s) => beginAssistantStream(s));
              }
              setState((s) => ({
                ...patchLastAssistant(s, reply),
                ...(suggestions.length ? { suggestions: suggestions.slice(0, 4) } : {}),
              }));
              setThinking(false);
            });
          },
        });

        if (output.handoffTo === "sidebyside" && opts.userMessage) {
          navigateHandoffToSide({
            userMessage: opts.userMessage,
            summary: output.handoffSummary || opts.userMessage,
            transitionReply: output.transitionReply?.trim() || "",
            understanding: output.understanding,
            graftedExtraUser: opts.userMessage,
          });
          return;
        }

        setState((s) => {
          let applied = streaming
            ? applyTurnResult(s, null, output, { skipUser: true, replaceLastAssistant: true })
            : applyTurnResult(
                s,
                userAlreadyShown ? null : userText,
                output,
                userAlreadyShown ? { skipUser: true } : undefined,
              );
          if (output.queueAdvance) {
            applied = advanceQueueSilent(applied, output.queueAdvance, listBlocked());
          }
          return withRematchConfirmAsk(withMatchConfirmAsk(applied));
        });
      } catch (e) {
        console.error("[matchmaker]", e);
      } finally {
        setThinking(false);
        tryMilestoneTitle(stateRef.current);
      }
    },
    [lang, navigateHandoffToSide, tryMilestoneTitle, t],
  );

  useEffect(() => {
    if (!hydrated || !sessionReady || !sessionId || bootedRef.current) return;
    bootedRef.current = true;
    if (pendingSeed) {
      const text = pendingSeed;
      setPendingSeed(null);
      void runTurn({ action: "message", userMessage: text, userTextForState: text, seed: text });
      return;
    }
    if (!sessionNeedsBootStart(state)) return;
    void runTurn({ action: "start", userTextForState: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionReady, sessionId, pendingSeed, state.messages.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    await runTurn({ action: "message", userMessage: trimmed, userTextForState: trimmed });
  }

  function handleReset() {
    clearActiveThreadId();
    try {
      window.sessionStorage.setItem("kindred:home:focus", "1");
    } catch {
      /* noop */
    }
    void navigate({ to: "/" });
  }

  function handlePassAndNext() {
    if (thinking) return;
    setState((s) => advanceQueueSilent(s, "pass", listBlocked()));
  }

  function handleSeeNext() {
    if (thinking) return;
    setState((s) => advanceQueueSilent(s, "see", listBlocked()));
  }

  function handleSeePrev() {
    if (thinking) return;
    setState((s) => retreatQueueSilent(s, listBlocked()));
  }

  const canGoPrev = canRetreatQueue(state, listBlocked());

  function handleAskResolve(askId: string, value: string | null) {
    if (askId.startsWith("rematch-")) {
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? {
                ...m,
                ask: undefined,
                askResolvedLabel:
                  value === "confirm"
                    ? t("introduce.rematch_confirmed")
                    : t("introduce.rematch_keep_editing"),
              }
            : m,
        ),
      }));
      if (value === "confirm") {
        void runTurn({ action: "confirm_rematch", userTextForState: null });
      } else {
        setState((s) => ({ ...s, pendingRematchConfirm: null }));
      }
      return;
    }
    if (askId.startsWith("match-")) {
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? {
                ...m,
                ask: undefined,
                askResolvedLabel:
                  value === "confirm" ? t("introduce.match_confirmed") : t("introduce.match_keep_editing"),
              }
            : m,
        ),
      }));
      if (value === "confirm") {
        void runTurn({ action: "confirm_match", userTextForState: null });
      } else {
        setState((s) => ({ ...s, pendingMatchConfirm: null }));
      }
      return;
    }
    if (value === null) {
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? { ...m, ask: undefined, askResolvedLabel: t("ask.resolved_cancelled") }
            : m,
        ),
      }));
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.ask?.id === askId ? { ...m, ask: undefined, askResolvedLabel: trimmed } : m,
      ),
    }));
  }

  if (!ready || !hydrated || !sessionReady || !sessionId)
    return <div className="min-h-screen bg-background" />;

  const messages: AgentMsg[] = state.messages;

  return (
    <Workspace
      agentNameKey="agents.matchmaker.name"
      agentSubtitleKey="agents.matchmaker.tagline"
      placeholderKey={
        state.phase === "clarifying" ? "chat.placeholder_first" : "chat.placeholder_followup"
      }
      messages={messages}
      thinking={thinking}
      onSend={send}
      onReset={handleReset}
      onAskResolve={handleAskResolve}
      suggestions={suggestChips(state, lang)}
      hasCanvas={Boolean(state.currentPersonId)}
      rightPane={
        state.currentPersonId ? (
          <IntroCanvas
            state={state}
            sessionId={sessionId}
            canGoPrev={canGoPrev}
            onRejectPerson={handlePassAndNext}
            onSeeNextPerson={handleSeeNext}
            onSeePrevPerson={handleSeePrev}
          />
        ) : null
      }
    />
  );
}
