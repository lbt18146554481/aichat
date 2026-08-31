import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeLang } from "@/lib/lang";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { IntroCanvas } from "@/components/canvas/intro-canvas";
import { consumeFocusPerson, consumeSeed } from "@/lib/seed";
import {
  EMPTY,
  applyTurnResult,
  beginStreamingTurn,
  focusPerson,
  load,
  patchLastAssistant,
  save,
  suggestChips,
  type MatchmakerState,
} from "@/lib/agents/matchmaker";
import { requestMatchmakerTurn } from "@/lib/matchmaker-client";
import type { MatchmakerTurnAction } from "@/lib/matchmaker-llm.server";
import type { HandoffContext } from "@/lib/handoff";
import {
  graftFromMatchmaker,
  markSessionSuspended,
  openSideBySideFromHandoff,
} from "@/lib/session-handoff";
import { ensureSessionsHydrated } from "@/lib/sessions";

export const Route = createFileRoute("/matchmaker")({
  validateSearch: (raw: Record<string, unknown>) => ({
    session: typeof raw.session === "string" ? raw.session : "",
  }),
  component: MatchmakerPage,
  head: () => ({
    meta: [
      { title: "Matchmaker — Maitri" },
      {
        name: "description",
        content: "Describe who you're looking for. The Matchmaker introduces one person at a time.",
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

  useEffect(() => {
    if (!sessionId) {
      setSessionReady(false);
      return;
    }
    let cancelled = false;
    setSessionReady(false);
    bootedRef.current = false;
    void (async () => {
      await ensureSessionsHydrated();
      if (cancelled) return;
      const loaded = load(sessionId);
      const focusId = consumeFocusPerson();
      setState(focusId ? focusPerson(loaded, focusId) : loaded);
      setSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && sessionReady && sessionId) save(state, sessionId);
  }, [state, hydrated, sessionReady, sessionId]);

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
        transitionReply:
          opts.transitionReply ||
          (lang === "zh-CN"
            ? "好，那我们改成帮你找一起做事的搭子——"
            : "Okay — let's find someone to do something with."),
      };
      save({ ...cur, suspended: true }, sessionId);
      markSessionSuspended(sessionId);
      const next = openSideBySideFromHandoff(handoff);
      void navigate({ to: "/side-by-side", search: { session: next.id, chatWith: "" } });
    },
    [lang, navigate, sessionId],
  );

  const runTurn = useCallback(
    async (opts: {
      action: MatchmakerTurnAction;
      userMessage?: string;
      userTextForState?: string | null;
      seed?: string;
    }) => {
      setThinking(true);
      const userText = opts.userTextForState ?? opts.userMessage ?? null;
      let streaming = false;
      try {
        const output = await requestMatchmakerTurn({
          lang,
          action: opts.action,
          userMessage: opts.userMessage,
          seed: opts.seed,
          state: stateRef.current,
          onDelta: (text) => {
            if (!streaming) {
              streaming = true;
              setState((s) => beginStreamingTurn(s, userText));
              setThinking(false);
            }
            setState((s) => patchLastAssistant(s, text));
          },
        });

        if (output.handoffTo === "sidebyside" && opts.userMessage) {
          navigateHandoffToSide({
            userMessage: opts.userMessage,
            summary: output.handoffSummary || opts.userMessage,
            transitionReply: output.transitionReply || output.reply,
            understanding: output.understanding,
            graftedExtraUser: opts.userMessage,
          });
          return;
        }

        setState((s) =>
          streaming
            ? applyTurnResult(s, null, output, { skipUser: true, replaceLastAssistant: true })
            : applyTurnResult(s, userText, output),
        );
      } catch (e) {
        console.error("[matchmaker]", e);
      } finally {
        setThinking(false);
      }
    },
    [lang, navigateHandoffToSide],
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
    if (state.messages.length > 0) {
      if (state.currentPersonId) return;
      const fromHandoff =
        state.handoff?.from === "orchestrator" || state.handoff?.from === "sidebyside";
      if (!fromHandoff) return;
    }
    void runTurn({ action: "start", userTextForState: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionReady, sessionId, pendingSeed, state.messages.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    await runTurn({ action: "message", userMessage: trimmed, userTextForState: trimmed });
  }

  function handleReset() {
    try {
      window.sessionStorage.setItem("kindred:home:focus", "1");
    } catch {
      /* noop */
    }
    void navigate({ to: "/" });
  }

  function handlePassAndNext() {
    if (thinking) return;
    void runTurn({ action: "pass_and_next", userTextForState: null });
  }

  function handleSeeNext() {
    if (thinking) return;
    void runTurn({ action: "see_next", userTextForState: null });
  }

  function handleAskResolve(askId: string, value: string | null) {
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
            onPassAndNext={handlePassAndNext}
            onSeeNextPerson={handleSeeNext}
          />
        ) : null
      }
    />
  );
}
