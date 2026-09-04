import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { consumeSeed } from "@/lib/seed";
import { findMatch, findNearMisses, getIntentById, hydrateMyIntents } from "@/lib/intents";
import { getPersonById } from "@/lib/people";
import { lastTrait, rememberTrait } from "@/lib/agent-memory";
import { loadProfile } from "@/lib/profile";
import { normalizeLang, pickLocaleText, pickLocaleList } from "@/lib/lang";
import { isSaved as isSavedGlobal } from "@/lib/saved-intents";
import { polishAssistantText, sideBySideSystem } from "@/lib/llm-client";
import { requestDetectHandoff } from "@/lib/orchestrator-client";
import { explicitActivityBuddySignal } from "@/lib/meet-someone-detect";
import { inferWishLaneFromText, isWishLaneSelectionMessage } from "@/lib/wish-lane";
import { requestSideBySideTurn } from "@/lib/side-by-side-client";
import type { SideTurnAction, SideTurnOutput } from "@/lib/side-llm.server";
import {
  beginSideTurnSession,
  endSideTurnSession,
  getSideTurnSession,
  publishSideTurnSession,
  subscribeSideTurnSession,
} from "@/lib/side-turn-session";
import type { HandoffContext } from "@/lib/handoff";
import {
  graftFromSide,
  openMatchmakerFromHandoff,
} from "@/lib/session-handoff";
import { clearActiveThreadId } from "@/lib/active-thread";
import { MAX_HANDOFF_COUNT } from "@/lib/handoff";
import {
  EMPTY,
  applyTurnResult,
  applyMatchPreview,
  appendUserMessage,
  backToCandidate,
  beginAssistantStream,
  beginStreamingTurn,
  clearPendingDraft,
  currentView,
  load,
  patchLastAssistant,
  patchWish,
  prepareSkipMatch,
  advanceSideQueueSilent,
  retreatSideQueueSilent,
  canRetreatSideQueue,
  resolveMineForQueue,
  receiveSimulatedReply,
  revokeAndReset,
  save,
  sendChatMessage,
  sessionNeedsBootStart,
  setAwaitingTrait,
  saveCurrent,
  unsave,
  chatWithSaved,
  startChat,
  tryNearMiss,
  uid,
  type LevelTier,
  type SideMsg,
  type SideState,
  type WhenTier,
} from "@/lib/agents/side-by-side";
import { useSessions } from "@/data/hooks";
import { refreshMilestoneThreadTitle } from "@/lib/thread-title-milestone";
import { buildSideBySideTitleContext } from "@/lib/thread-title";
import { parseWishPublishFormValue } from "@/components/wish-publish-form";
import { EMPTY_BUDDY_HARD_FILTERS } from "@/lib/wish-types";

export const Route = createFileRoute("/side-by-side")({
  validateSearch: (raw: Record<string, unknown>) => ({
    session: typeof raw.session === "string" ? raw.session : "",
    chatWith: typeof raw.chatWith === "string" ? raw.chatWith : "",
  }),
  component: SideBySidePage,
  head: () => ({
    meta: [
      { title: "一起做事 — Maitri" },
      { name: "description", content: "在你们都在做的事里相遇。" },
    ],
  }),
});

function msg(role: "user" | "assistant", text: string, chips?: SideMsg["chips"]): SideMsg {
  return { id: uid(), role, t: Date.now(), text, ...(chips ? { chips } : {}) };
}

// Chips attached to the Agent message when a match arrives — deprecated; use LLM suggestions.

// ---- Question detection (demo keyword matching, not real NLU) --------
type Question = "about_person" | "opener" | "reply_hint" | "new_type" | "new_activity" | null;

function classify(text: string): Question {
  const s = text.toLowerCase();
  // "new activity" — user wants to change what they're doing entirely
  if (
    /(换件事|换个事|换件别的|做点别的|别的事|做别的|new wish|new activity|something else|different thing)/i.test(
      text,
    )
  )
    return "new_activity";
  // "different kind of person" — same activity, different TA
  if (
    /(不一样的人|换个人|换一个|其他人|别的人|different person|someone else|someone different|other kind)/i.test(
      text,
    )
  )
    return "new_type";
  // Draft an opener
  if (
    /(开场白|怎么开始|怎么打招呼|想句话|想一句|opener|first line|first message|what to say|how to start)/i.test(
      text,
    )
  )
    return "opener";
  // Reply hint
  if (
    /(怎么回|回什么|想不出|怎么答|help me reply|what should i say|what to reply|not sure how)/i.test(
      text,
    )
  )
    return "reply_hint";
  // Who is TA
  if (
    /(TA 是|ta是|什么样的人|介绍.*TA|介绍下|介绍一下|多讲讲|讲讲 TA|讲讲ta|who is|tell me about|more about|what.*they like)/i.test(
      text,
    )
  )
    return "about_person";
  return null;
}

function SideBySidePage() {
  const { ready } = useRequireAuth();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const sessionId = search.session || null;
  const chatWithId = search.chatWith || "";

  // Consume the homepage-seeded prompt exactly once. consumeSeed() removes the
  // value from sessionStorage on read, so we must not call it twice.
  const [pendingSeed, setPendingSeed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return consumeSeed("sidebyside");
  });

  const [state, setState] = useState<SideState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const stateRef = useRef(state);
  const mountedRef = useRef(true);
  const bootedRef = useRef(false);
  const handoffWishFired = useRef(false);
  const { isFetched: sessionsReady } = useSessions();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !sessionsReady) {
      setSessionReady(false);
      return;
    }
    setSessionReady(false);
    bootedRef.current = false;
    handoffWishFired.current = false;
    const loaded = load(sessionId);
    const liveTurn = getSideTurnSession(sessionId);
    const initial = liveTurn?.working ?? loaded;
    stateRef.current = initial;
    setState(initial);
    if (liveTurn) {
      setThinking(liveTurn.meta.thinking && !liveTurn.meta.streaming);
    }
    setSessionReady(true);
  }, [sessionId, sessionsReady]);

  useEffect(() => {
    if (!sessionId) return;
    return subscribeSideTurnSession(sessionId, (next, meta) => {
      stateRef.current = next;
      setState(next);
      setThinking(meta.thinking && !meta.streaming);
    });
  }, [sessionId]);

  const withMatchChips = (next: SideState, _prevMatchId: string | null): SideState => next;

  const withNomatchChips = (next: SideState): SideState => next;

  const withBrowseConfirmAsk = (next: SideState): SideState => {
    // Browse consent is handled in chat — user confirms with natural language (好的/开始找吧).
    return next;
  };

  const withPublishConfirmAsk = (next: SideState): SideState => {
    // Publish form lives in the right canvas — state.pendingConfirm drives MeetCanvas.
    return next;
  };

  const withMatchConfirmAsk = (next: SideState): SideState => {
    // Match consent is handled in chat — user confirms with natural language, not inline buttons.
    return next;
  };

  const attachHandoffConfirmAsk = (
    next: SideState,
    opts: { userMessage: string; summary: string; transitionReply: string },
  ): SideState => {
    const prompt = opts.transitionReply?.trim() || t("intent.handoff_confirm_prompt");
    const msgs = [...next.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant" && !last.ask) {
      msgs[msgs.length - 1] = {
        ...last,
        text: last.text?.trim() ? last.text : prompt,
        ask: {
          kind: "confirm",
          id: "handoff-confirm-" + Date.now(),
          confirmLabel: t("intent.handoff_clarify_yes"),
          cancelLabel: t("intent.handoff_clarify_no"),
        },
      };
    } else {
      msgs.push({
        id: uid(),
        role: "assistant",
        t: Date.now(),
        text: prompt,
        ask: {
          kind: "confirm",
          id: "handoff-confirm-" + Date.now(),
          confirmLabel: t("intent.handoff_clarify_yes"),
          cancelLabel: t("intent.handoff_clarify_no"),
        },
      });
    }
    return {
      ...next,
      pendingHandoff: {
        target: "matchmaker",
        summary: opts.summary,
        transitionReply: opts.transitionReply,
        userMessage: opts.userMessage,
      },
      messages: msgs,
    };
  };

  const runTurn = async (opts: {
    action: SideTurnAction;
    userMessage?: string;
    userTextForState?: string | null;
    seed?: string;
    preferredTrait?: string;
    stateOverride?: SideState;
    fromPublishForm?: boolean;
  }): Promise<SideTurnOutput | undefined> => {
    if (!sessionId) return undefined;
    const baseState = opts.stateOverride ?? stateRef.current;
    const prevMatch = baseState.matchIntentId;
    const userTextForState = opts.userTextForState?.trim() || null;
    const shouldAppendUser = Boolean(userTextForState);
    /** User bubble already committed in handleSend before this turn. */
    const userPreShown = !shouldAppendUser && Boolean(opts.userMessage?.trim());
    let working = baseState;
    if (shouldAppendUser) {
      working = appendUserMessage(baseState, userTextForState!);
      working = { ...working, suggestions: [] };
    }
    const skipUserInState = shouldAppendUser || userPreShown;
    beginSideTurnSession(sessionId, working);
    stateRef.current = working;
    if (mountedRef.current) {
      flushSync(() => setState(working));
      setThinking(true);
    }

    let streaming = false;
    let followUpStreaming = false;

    const commitWorking = (
      next: SideState,
      meta?: { thinking?: boolean; streaming?: boolean },
    ) => {
      working = next;
      stateRef.current = next;
      publishSideTurnSession(sessionId, next, meta);
      if (mountedRef.current) flushSync(() => setState(next));
    };

    const applyStreamText = (text: string, suggestions?: string[]) => {
      if (!streaming) {
        streaming = true;
        working = beginAssistantStream(working);
      }
      working = patchLastAssistant(working, text);
      if (suggestions?.length) {
        working = { ...working, suggestions: suggestions.slice(0, 4) };
      }
      commitWorking(working, { thinking: false, streaming: true });
      if (mountedRef.current) setThinking(false);
    };

    const applyFollowUpStreamText = (text: string, suggestions?: string[]) => {
      if (!followUpStreaming) {
        followUpStreaming = true;
        working = beginAssistantStream(working);
      }
      working = patchLastAssistant(working, text);
      if (suggestions?.length) {
        working = { ...working, suggestions: suggestions.slice(0, 4) };
      }
      commitWorking(working, { thinking: false, streaming: true });
      if (mountedRef.current) setThinking(false);
    };

    const buildFinalState = (
      output: SideTurnOutput,
      handoffAttach?: {
        userMessage: string;
        summary: string;
        transitionReply: string;
      },
    ): SideState => {
      const base = streaming || skipUserInState ? working : baseState;
      const streamed = streaming || followUpStreaming;
      const twoPhase = Boolean(output.followUpReply && streaming);
      let next = applyTurnResult(
        base,
        streaming || skipUserInState ? null : userTextForState ?? opts.userMessage ?? null,
        handoffAttach ? { ...output, handoffTo: null } : output,
        streamed
          ? {
              skipUser: true,
              skipAssistant:
                twoPhase ||
                Boolean(output.publishPlaceError) ||
                Boolean(output.suppressAssistantReply),
              replaceLastAssistant:
                streaming && !output.followUpReply && !output.suppressAssistantReply,
              twoPhaseStreamed: twoPhase,
            }
          : output.publishPlaceError
            ? { skipUser: true, skipAssistant: true }
            : output.suppressAssistantReply
              ? { skipAssistant: true }
              : skipUserInState
                ? { skipUser: true }
                : undefined,
      );

      if (output.suppressAssistantReply && streaming) {
        const msgs = next.messages;
        if (msgs[msgs.length - 1]?.role === "assistant") {
          next = { ...next, messages: msgs.slice(0, -1) };
        }
      }

      if (handoffAttach) {
        next = attachHandoffConfirmAsk(next, handoffAttach);
      } else if (output.publishPlaceError) {
        next = {
          ...next,
          wishDraft: output.wishDraft,
          pendingConfirm: output.pendingConfirm ?? next.pendingConfirm,
          publishPlaceError: output.publishPlaceError,
          publishPending: false,
        };
      } else if (output.myIntentId && opts.fromPublishForm) {
        next = {
          ...next,
          publishPlaceError: null,
          pendingConfirm: null,
          publishPending: false,
        };
      } else {
        next = { ...next, publishPending: false };
        next = withPublishConfirmAsk(next);
      }

      if (!output.publishPlaceError && !handoffAttach) {
        next = withBrowseConfirmAsk(next);
        next = withMatchConfirmAsk(next);
      }
      next = withMatchChips(next, prevMatch);
      next = withNomatchChips(next);
      return next;
    };

    try {
      const output = await requestSideBySideTurn({
        lang,
        action: opts.action,
        userMessage: opts.userMessage,
        seed: opts.seed,
        preferredTrait: opts.preferredTrait ?? lastTrait() ?? undefined,
        state: working,
        onDelta: (text) => applyStreamText(text),
        onReady: ({ reply, suggestions }) => applyStreamText(reply, suggestions),
        onMatching: () => {
          publishSideTurnSession(sessionId, working, { thinking: true, streaming });
          if (mountedRef.current) flushSync(() => setThinking(true));
        },
        onMatchReady: (preview) => {
          let next = applyMatchPreview(working, preview);
          next = withNomatchChips(next);
          commitWorking(next, { thinking: false, streaming });
        },
        onFollowUpDelta: (text) => {
          if (!followUpStreaming) followUpStreaming = true;
          applyFollowUpStreamText(text);
        },
        onFollowUpReady: ({ reply, suggestions }) => {
          if (!followUpStreaming) followUpStreaming = true;
          applyFollowUpStreamText(reply, suggestions);
        },
      });

      if (output.handoffTo === "matchmaker" && opts.userMessage) {
        const next = buildFinalState(output, {
          userMessage: opts.userMessage,
          summary: output.handoffSummary || opts.userMessage,
          transitionReply: output.transitionReply || output.reply,
        });
        commitWorking(next, { thinking: false, streaming: false });
        return output;
      }

      const next = buildFinalState(output);
      commitWorking(next, { thinking: false, streaming: false });

      const wishPublished = Boolean(output.myIntentId && !baseState.myIntentId);
      if (wishPublished) {
        void hydrateMyIntents();
      }
      if (wishPublished && sessionId && !baseState.titleMilestoneDone) {
        const wishText =
          output.wishDraft?.rawText?.trim() ||
          working.wishDraft?.rawText?.trim() ||
          opts.userMessage?.trim() ||
          "";
        if (wishText) {
          refreshMilestoneThreadTitle({
            sessionId,
            lang,
            agent: "do_something",
            context: buildSideBySideTitleContext(lang, wishText, working.messages),
            onDone: () => {
              const patched = { ...stateRef.current, titleMilestoneDone: true };
              commitWorking(patched, { thinking: false, streaming: false });
            },
          });
        }
      }
      return output;
    } catch (e) {
      console.error("[side-by-side]", e);
      const cur = working;
      const hasEmptyTail =
        cur.messages.length > 0 &&
        cur.messages[cur.messages.length - 1]?.role === "assistant" &&
        !cur.messages[cur.messages.length - 1]?.text.trim();
      const fallback = msg("assistant", t("intent.server_error"));
      const next = hasEmptyTail
        ? {
            ...cur,
            publishPending: false,
            messages: cur.messages.map((m, i) =>
              i === cur.messages.length - 1 ? { ...m, text: fallback.text } : m,
            ),
          }
        : { ...cur, publishPending: false, messages: [...cur.messages, fallback] };
      commitWorking(next, { thinking: false, streaming: false });
    } finally {
      endSideTurnSession(sessionId);
      if (mountedRef.current) setThinking(false);
    }
    return undefined;
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Every side-by-side page must live under a session; no id → home.
  // (City is required for matching, but instead of kicking the user to
  // /profile we ask inline via an Agent Ask when they submit a wish.)
  useEffect(() => {
    if (!sessionId) {
      void navigate({ to: "/" });
      return;
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated && sessionReady && sessionId) save(state, sessionId);
  }, [state, hydrated, sessionReady, sessionId]);

  // Opening: LLM start when empty, or after handoff before first agent reply.
  // Seed / pending wish fire their own message turns below.
  useEffect(() => {
    if (!hydrated || !sessionReady || !sessionId || bootedRef.current) return;
    if (getSideTurnSession(sessionId)) {
      bootedRef.current = true;
      return;
    }
    bootedRef.current = true;
    if (pendingSeed) return;
    if (!sessionNeedsBootStart(state)) return;
    const seed =
      state.handoff?.seed?.trim() || state.handoff?.summary?.trim() || undefined;
    void runTurn({
      action: "start",
      preferredTrait: lastTrait() ?? undefined,
      seed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionReady, sessionId, pendingSeed, state.messages.length]);

  // Handoff from Matchmaker/home: auto-run pending wish once.
  useEffect(() => {
    if (!hydrated || !sessionReady || handoffWishFired.current) return;
    const wish = state.pendingWishText?.trim();
    if (!wish || state.myIntentId || state.stage !== "prompt") return;
    // History resume — already continued; drop stale pending wish.
    if (state.messages.length > 0) {
      handoffWishFired.current = true;
      setState((s) => (s.pendingWishText ? { ...s, pendingWishText: undefined } : s));
      return;
    }
    handoffWishFired.current = true;
    setState((s) => ({ ...s, pendingWishText: undefined }));
    void runTurn({ action: "message", userMessage: wish, userTextForState: wish, seed: wish });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionReady, state.pendingWishText, state.myIntentId, state.stage]);

  // Re-run match on mount — when the user returns from History, this is
  // their "peek and see if someone showed up while I was gone". Only runs
  // once per hydration for a still-waiting wish.
  useEffect(() => {
    if (!hydrated || !sessionReady) return;
    if (state.stage !== "published" || state.matchIntentId) return;
    if (!state.myIntentId) return;
    const mine = getIntentById(state.myIntentId);
    if (!mine) return;
    const hit = findMatch(mine, {
      exclude: state.triedIntentIds ?? [],
      excludeOwnerIds: state.triedOwnerIds ?? [],
    });
    if (hit) {
      setState((s) => ({ ...s, matchIntentId: hit.id, nearMissIds: [] }));
      return;
    }
    const nears = findNearMisses(mine, {
      exclude: state.triedIntentIds ?? [],
      excludeOwnerIds: state.triedOwnerIds ?? [],
    });
    setState((s) => ({ ...s, nearMissIds: nears.map((n) => n.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Consume the homepage-seeded prompt automatically.
  useEffect(() => {
    if (!hydrated || !pendingSeed) return;
    const text = pendingSeed;
    setPendingSeed(null);
    void runTurn({ action: "message", userMessage: text, userTextForState: text, seed: text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, pendingSeed]);

  // Deep-link from the global Saved drawer: open TA chat directly.
  useEffect(() => {
    if (!hydrated || !chatWithId) return;
    setState((s) => chatWithSaved(s, chatWithId, undefined, lang));
    // Strip the param after consuming so a refresh doesn't re-fire it.
    void navigate({
      to: "/side-by-side",
      search: { session: sessionId ?? "", chatWith: "" },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, chatWithId]);

  function actWith(mutate: (s: SideState) => SideState, userText?: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const withUser: SideState = userText
          ? { ...s, messages: [...s.messages, msg("user", userText)] }
          : s;
        return mutate(withUser);
      });
      setThinking(false);
    }, 320);
  }

  // ---- Agent-Q&A replies -------------------------------------------------
  // These add an assistant message + (optionally) a chip. They do NOT
  // change the intent / match state.

  async function respondAboutPerson(userText: string, userShown = false) {
    setThinking(true);
    const other = stateRef.current.matchIntentId
      ? getIntentById(stateRef.current.matchIntentId)
      : null;
    const person = other ? getPersonById(other.ownerId) : null;
    const brief = person?.personBrief
      ? pickLocaleText(lang, person.personBrief.en, person.personBrief.zh)
      : t("intent.agent_no_brief");
    const assistantMsg = msg("assistant", brief);
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages,
        ...(userShown ? [] : [msg("user", userText)]),
        assistantMsg,
      ],
    }));
    if (person) {
      const polished = await polishAssistantText({
        fallback: brief,
        system: sideBySideSystem(
          lang,
          `Person: ${person.name}. ${person.portrait}. Bio: ${person.personBrief?.en ?? ""}`,
        ),
        history: [],
        userMessage: userText || "Tell me about them.",
      });
      if (polished !== brief) {
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, text: polished } : m)),
        }));
      }
    }
    setThinking(false);
  }

  function respondOpener(userText: string, _forChat: boolean, userShown = false) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const other = s.matchIntentId ? getIntentById(s.matchIntentId) : null;
        const person = other ? getPersonById(other.ownerId) : null;
        const line = person?.openerSuggestion
          ? pickLocaleText(lang, person.openerSuggestion.en, person.openerSuggestion.zh)
          : null;
        const userLine = userShown ? [] : [msg("user", userText)];
        if (!line) {
          return {
            ...s,
            messages: [
              ...s.messages,
              ...userLine,
              msg("assistant", t("intent.agent_no_opener")),
            ],
          };
        }
        const body = `${t("intent.agent_opener_lead")}\n\n"${line}"`;
        return {
          ...s,
          suggestions: [line],
          messages: [...s.messages, ...userLine, msg("assistant", body)],
        };
      });
      setThinking(false);
    }, 320);
  }

  function respondReplyHint(userText: string, userShown = false) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const other = s.matchIntentId ? getIntentById(s.matchIntentId) : null;
        const person = other ? getPersonById(other.ownerId) : null;
        const hints = person?.replyHints
          ? pickLocaleList(lang, person.replyHints.en, person.replyHints.zh)
          : null;
        const line = hints && hints.length > 0 ? hints[s.chatMessages.length % hints.length] : null;
        const userLine = userShown ? [] : [msg("user", userText)];
        if (!line) {
          return {
            ...s,
            messages: [
              ...s.messages,
              ...userLine,
              msg("assistant", t("intent.agent_no_reply_hint")),
            ],
          };
        }
        const body = `${t("intent.agent_reply_lead")}\n\n"${line}"`;
        return {
          ...s,
          suggestions: [line],
          messages: [...s.messages, ...userLine, msg("assistant", body)],
        };
      });
      setThinking(false);
    }, 320);
  }

  async function askForTrait(userText: string, userShown = false) {
    setThinking(true);
    const fallback = t("intent.ask_trait_fallback");
    setState((s) =>
      setAwaitingTrait(
        {
          ...s,
          messages: [
            ...s.messages,
            ...(userShown ? [] : [msg("user", userText)]),
            msg("assistant", fallback),
          ],
        },
        true,
      ),
    );
    const polished = await polishAssistantText({
      fallback,
      system: sideBySideSystem(
        lang,
        lang === "zh-CN"
          ? "用户想换一位搭子。自然问一句他们更想找什么样的人（性格/节奏等），1-2句，不要列表。必须用简体中文。"
          : "User wants a different kind of match. Naturally ask what sort of person they prefer — 1-2 sentences, no bullet list. Reply in English only — no Chinese.",
      ),
      history: state.messages.slice(-6).map((m) => ({ role: m.role, content: m.text })),
      userMessage: userText,
    });
    if (polished !== fallback) {
      setState((s) => {
        const msgs = [...s.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant") {
            msgs[i] = { ...msgs[i], text: polished };
            break;
          }
        }
        return { ...s, messages: msgs };
      });
    }
    setThinking(false);
  }

  function consumeTraitAndSkip(userText: string) {
    rememberTrait(userText);
    const prepared = prepareSkipMatch({ ...stateRef.current, awaitingTrait: false });
    setState(prepared);
    void runTurn({ action: "skip_match", userMessage: userText, userTextForState: userText, stateOverride: prepared });
  }

  function startNewActivity(userText?: string) {
    const cleared = revokeAndReset(stateRef.current, sessionId);
    const withUser: SideState = {
      ...cleared,
      messages: userText ? [msg("user", userText)] : [],
    };
    setState(withUser);
    void runTurn({
      action: "start",
      preferredTrait: lastTrait() ?? undefined,
      userTextForState: null,
      stateOverride: withUser,
    });
  }

  function handleSend(text: string) {
    // If we asked "what kind of person" and are waiting on a trait, treat
    // whatever they type next as the trait.
    if (state.awaitingTrait) {
      consumeTraitAndSkip(text);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    // Show the user message immediately — handoff detect is async and must not block UI.
    const staged = appendUserMessage(stateRef.current, trimmed);
    stateRef.current = { ...staged, suggestions: [] };
    flushSync(() => setState(stateRef.current));
    setThinking(true);

    // Mid-conversation switch to Matchmaker (async detect).
    // Skip while lane is unset — user is still picking publish vs browse.
    const skipHandoff =
      staged.wishLane === "unset" ||
      explicitActivityBuddySignal(trimmed) ||
      isWishLaneSelectionMessage(trimmed);

    void (async () => {
      const count = staged.handoffCount ?? 0;
      if (!skipHandoff && count < MAX_HANDOFF_COUNT && sessionId) {
        try {
          const det = await requestDetectHandoff({
            lang: lang === "zh-CN" ? "zh-CN" : "en",
            currentAgent: "sidebyside",
            userMessage: trimmed,
            history: staged.messages
              .slice(0, -1)
              .map((m) => ({ role: m.role, content: m.text })),
            handoffCount: count,
          });
          if (det.needsClarify && det.clarifyReply.trim()) {
            setState((s) => ({
              ...s,
              pendingHandoff: {
                target: "matchmaker",
                summary: det.summary || trimmed,
                transitionReply: det.transitionReply,
                userMessage: trimmed,
                clarify: true,
              },
              messages: [
                ...s.messages,
                {
                  id: uid(),
                  role: "assistant",
                  t: Date.now(),
                  text: det.clarifyReply.trim(),
                  ask: {
                    kind: "confirm",
                    id: "handoff-clarify-" + Date.now(),
                    confirmLabel: t("intent.handoff_clarify_yes"),
                    cancelLabel: t("intent.handoff_clarify_no"),
                  },
                },
              ],
            }));
            setThinking(false);
            return;
          }
          if (det.handoffTo === "matchmaker") {
            setState((s) =>
              attachHandoffConfirmAsk(s, {
                userMessage: trimmed,
                summary: det.summary || trimmed,
                transitionReply: det.transitionReply,
              }),
            );
            setThinking(false);
            return;
          }
        } catch (e) {
          console.warn("[side-by-side handoff detect]", e);
        }
      }

      handleSendContinue(trimmed, { userShown: true });
    })();
  }

  function performHandoffToMatchmaker(opts: {
    userMessage: string;
    summary: string;
    transitionReply: string;
    revoke: boolean;
  }) {
    if (!sessionId) return;
    const cur = stateRef.current;
    if (opts.revoke && cur.myIntentId) {
      revokeAndReset(cur, sessionId);
    }
    const handoff: HandoffContext = {
      from: "sidebyside",
      parentSessionId: sessionId,
      seed: opts.userMessage,
      summary: opts.summary,
      graftedMessages: graftFromSide(cur, opts.userMessage),
      handoffCount: (cur.handoffCount ?? 0) + 1,
      transitionReply:
        opts.transitionReply || t("intent.transition_to_matchmaker"),
    };
    save({ ...cur, suspended: true, pendingHandoff: undefined }, sessionId);
    const next = openMatchmakerFromHandoff(handoff, sessionId);
    void navigate({ to: "/matchmaker", search: { session: next.id, focus: "" } });
  }

  function handleSendContinue(text: string, opts?: { userShown?: boolean }) {
    const cur = stateRef.current;
    // Route by keyword when we're in a match or chat context.
    if (cur.stage === "published" && cur.matchIntentId) {
      const q = classify(text);
      if (q === "new_activity") return startNewActivity(text);
      if (q === "new_type") return askForTrait(text, opts?.userShown);
      if (q === "about_person") return respondAboutPerson(text, opts?.userShown);
      if (q === "opener") return respondOpener(text, /*forChat*/ false, opts?.userShown);
      if (q === "reply_hint") return respondReplyHint(text, opts?.userShown);
      // Otherwise fall through to submitPrompt (user is publishing a new wish).
    }
    if (cur.stage === "chat") {
      const q = classify(text);
      if (q === "new_activity") return startNewActivity(text);
      if (q === "about_person") return respondAboutPerson(text, opts?.userShown);
      if (q === "opener") return respondOpener(text, /*forChat*/ true, opts?.userShown);
      if (q === "reply_hint") return respondReplyHint(text, opts?.userShown);
      if (q === "new_type") {
        setState((s) => ({ ...s, stage: "published", chatMessages: [] }));
        void askForTrait(text, opts?.userShown);
        return;
      }
      // Fall through: user typed a new wish mid-chat — publish it.
    }

    void runTurn({
      action: "message",
      userMessage: text,
      userTextForState: opts?.userShown ? null : text,
      stateOverride: (() => {
        let next = opts?.userShown ? stateRef.current : cur;
        const lane = inferWishLaneFromText(text);
        if (
          lane &&
          (next.wishLane === "unset" || (next.wishLane === "browse" && lane === "publish"))
        ) {
          next = { ...next, wishLane: lane };
          stateRef.current = next;
          flushSync(() => setState(next));
        } else if (isWishLaneSelectionMessage(text)) {
          const pick = inferWishLaneFromText(text);
          if (pick && next.wishLane === "unset") {
            next = { ...next, wishLane: pick };
            stateRef.current = next;
            flushSync(() => setState(next));
          }
        }
        return opts?.userShown || next !== cur ? next : undefined;
      })(),
    });
  }

  function handlePublishResolve(value: string | null) {
    const payload = value ? parseWishPublishFormValue(value) : null;
    if (!payload) {
      setState((s) => {
        const next = { ...s, pendingConfirm: null, publishPlaceError: null };
        stateRef.current = next;
        return next;
      });
      return;
    }
    const prepared: SideState = {
      ...stateRef.current,
      wishDraft: payload.draft,
      understanding: stateRef.current.understanding,
      pendingConfirm: null,
      publishPlaceError: null,
      publishPending: true,
      wishLane: stateRef.current.wishLane === "unset" ? "publish" : stateRef.current.wishLane,
    };
    stateRef.current = prepared;
    flushSync(() => setState(prepared));
    void runTurn({
      action: "confirm_publish",
      userTextForState: null,
      stateOverride: prepared,
      fromPublishForm: true,
    });
  }

  function handleAskResolve(askId: string, value: string | null) {
    if (askId.startsWith("browse-")) {
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? {
                ...m,
                ask: undefined,
                askResolvedLabel:
                  value === "confirm" ? t("intent.browse_confirmed") : t("intent.browse_keep_editing"),
              }
            : m,
        ),
      }));
      if (value === "confirm") {
        void runTurn({ action: "confirm_browse", userTextForState: null });
      } else {
        setState((s) => ({ ...s, pendingBrowseConfirm: null }));
      }
      return;
    }
    if (askId.startsWith("publish-")) {
      handlePublishResolve(value);
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
                  value === "confirm"
                    ? t("introduce.match_confirmed")
                    : t("introduce.match_keep_editing"),
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
    if (askId.startsWith("handoff-confirm-")) {
      const pending = state.pendingHandoff;
      const resolveConfirm = (label: string) =>
        state.messages.map((m) =>
          m.ask?.id === askId ? { ...m, ask: undefined, askResolvedLabel: label } : m,
        );

      if (value === "confirm" && pending) {
        if (state.myIntentId) {
          setState((s) => ({
            ...s,
            pendingHandoff: {
              target: "matchmaker",
              summary: pending.summary,
              transitionReply: pending.transitionReply,
              userMessage: pending.userMessage,
            },
            messages: [
              ...resolveConfirm(t("intent.handoff_clarify_resolved_yes")),
              {
                id: uid(),
                role: "assistant",
                t: Date.now(),
                text: t("intent.handoff_revoke_prompt"),
                ask: {
                  kind: "confirm",
                  id: "handoff-revoke-" + Date.now(),
                  confirmLabel: t("intent.handoff_revoke_yes"),
                  cancelLabel: t("intent.handoff_revoke_no"),
                },
              },
            ],
          }));
          return;
        }
        setState((s) => ({
          ...s,
          pendingHandoff: undefined,
          messages: resolveConfirm(t("intent.handoff_clarify_resolved_yes")),
        }));
        performHandoffToMatchmaker({
          userMessage: pending.userMessage,
          summary: pending.summary,
          transitionReply: pending.transitionReply,
          revoke: false,
        });
        return;
      }

      setState((s) => ({
        ...s,
        pendingHandoff: undefined,
        messages: resolveConfirm(t("intent.handoff_clarify_resolved_no")),
      }));
      return;
    }
    // Detect was unsure: confirm=switch to meet-someone, cancel=stay on Side
    if (askId.startsWith("handoff-clarify-")) {
      const pending = state.pendingHandoff;
      const resolveClarify = (label: string) =>
        state.messages.map((m) =>
          m.ask?.id === askId ? { ...m, ask: undefined, askResolvedLabel: label } : m,
        );

      if (value === "confirm" && pending) {
        if (state.myIntentId) {
          setState((s) => ({
            ...s,
            pendingHandoff: {
              target: "matchmaker",
              summary: pending.summary,
              transitionReply: pending.transitionReply,
              userMessage: pending.userMessage,
            },
            messages: [
              ...resolveClarify(t("intent.handoff_clarify_resolved_yes")),
              {
                id: uid(),
                role: "assistant",
                t: Date.now(),
                text: t("intent.handoff_revoke_prompt"),
                ask: {
                  kind: "confirm",
                  id: "handoff-revoke-" + Date.now(),
                  confirmLabel: t("intent.handoff_revoke_yes"),
                  cancelLabel: t("intent.handoff_revoke_no"),
                },
              },
            ],
          }));
          return;
        }
        setState((s) => ({
          ...s,
          pendingHandoff: undefined,
          messages: resolveClarify(t("intent.handoff_clarify_resolved_yes")),
        }));
        performHandoffToMatchmaker({
          userMessage: pending.userMessage,
          summary: pending.summary,
          transitionReply: pending.transitionReply,
          revoke: false,
        });
        return;
      }

      setState((s) => ({
        ...s,
        pendingHandoff: undefined,
        messages: resolveClarify(t("intent.handoff_clarify_resolved_no")),
      }));
      return;
    }
    // Handoff to matchmaker: confirm=withdraw wish, cancel=keep wish
    if (askId.startsWith("handoff-revoke-")) {
      const pending = state.pendingHandoff;
      setState((s) => ({
        ...s,
        pendingHandoff: undefined,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? {
                ...m,
                ask: undefined,
                askResolvedLabel:
                  value === "confirm" ? t("intent.handoff_resolved_yes") : t("intent.handoff_resolved_no"),
              }
            : m,
        ),
      }));
      if (pending) {
        performHandoffToMatchmaker({
          userMessage: pending.userMessage,
          summary: pending.summary,
          transitionReply: pending.transitionReply,
          revoke: value === "confirm",
        });
      }
      return;
    }
    // Revoke confirm ask.
    if (askId.startsWith("revoke-")) {
      const summary = value === "confirm" || value === "yes" ? t("ask.resolved_revoke_yes") : t("ask.resolved_revoke_no");
      setState((s) => {
        const nextMessages = s.messages.map((m) =>
          m.ask?.id === askId ? { ...m, ask: undefined, askResolvedLabel: summary } : m,
        );
        if (value === "confirm" || value === "yes")
          return { ...revokeAndReset(s, sessionId), messages: nextMessages };
        return { ...s, messages: nextMessages };
      });
      return;
    }
  }

  function askRevokeConfirm() {
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          id: uid(),
          role: "assistant",
          t: Date.now(),
          text: t("intent.ask_revoke_prompt"),
          ask: {
            kind: "confirm",
            id: "revoke-" + Date.now(),
            confirmLabel: t("ask.revoke_yes"),
            cancelLabel: t("ask.revoke_no"),
            tone: "danger",
          },
        },
      ],
    }));
  }

  // Right-pane actions are silent on the left Agent — they don't inject
  // narration into the private chat. The user's own typed prompts still do.
  function handleStartChat() {
    setState((s) => {
      const next = startChat(s, undefined, lang);
      stateRef.current = next;
      return next;
    });
  }
  function handleRevoke() {
    askRevokeConfirm();
  }
  function handleTryNearMiss(intentId: string) {
    const prepared = tryNearMiss(stateRef.current, intentId);
    setState(prepared);
    void runTurn({ action: "rematch", userTextForState: null, stateOverride: prepared });
  }
  function handleSave() {
    setState((s) => saveCurrent(s, sessionId));
  }

  function handleUnsave(intentId: string) {
    setState((s) => unsave(s, intentId));
  }
  function handleChatWithSaved(intentId: string) {
    setState((s) => chatWithSaved(s, intentId, undefined, lang));
  }
  function handleEditWish(patch: { when?: WhenTier; level?: LevelTier; city?: string }) {
    const prepared = patchWish(stateRef.current, patch);
    setState(prepared);
    void runTurn({ action: "rematch", userTextForState: null, stateOverride: prepared });
  }
  function handleSkip() {
    const cur = stateRef.current;
    const mine = resolveMineForQueue(cur);
    if ((cur.rankedQueue?.length ?? 0) > 0) {
      const next = advanceSideQueueSilent(cur, "pass", mine);
      stateRef.current = next;
      setState(next);
      save(next, sessionId);
      return;
    }
    const prepared = prepareSkipMatch(cur);
    setState(prepared);
    void runTurn({ action: "skip_match", userTextForState: null, stateOverride: prepared });
  }

  function handleSeeNext() {
    const cur = stateRef.current;
    const mine = resolveMineForQueue(cur);
    if ((cur.rankedQueue?.length ?? 0) === 0) return;
    const next = advanceSideQueueSilent(cur, "see", mine);
    stateRef.current = next;
    setState(next);
    save(next, sessionId);
  }

  function handleSeePrev() {
    const cur = stateRef.current;
    const mine = resolveMineForQueue(cur);
    const result = retreatSideQueueSilent(cur, mine);
    if (result.atStart) return;
    stateRef.current = result;
    setState(result);
    save(result, sessionId);
  }

  const canGoPrev = canRetreatSideQueue(state);

  function handleRevokeReshare() {
    setState((s) => revokeAndReset(s, sessionId));
  }
  async function handleSendChat(text: string, opts?: { attachWishCard?: boolean }) {
    const wishIntentId = stateRef.current.matchIntentId;
    const next = sendChatMessage(stateRef.current, text, {
      attachWishCard: opts?.attachWishCard,
      wishIntentId: opts?.attachWishCard ? wishIntentId ?? undefined : undefined,
    });
    stateRef.current = next;
    setState(next);
    if (!text.trim()) return;
    setThinking(true);
    const other = stateRef.current.matchIntentId ? getIntentById(stateRef.current.matchIntentId) : null;
    const person = other ? getPersonById(other.ownerId) : null;
    const fallback = t("intent.chat_fallback");
    const chatHistory = (stateRef.current.chatMessages ?? [])
      .filter((m) => m.kind !== "wish_card" && m.text.trim())
      .slice(-8);
    const reply = await polishAssistantText({
      fallback,
      system: sideBySideSystem(
        lang,
        person
          ? `You are roleplaying as ${person.name}. ${person.portrait}. Reply briefly as them in the activity chat.${lang === "zh-CN" ? " Use Simplified Chinese only." : " Use English only — no Chinese characters."}`
          : `Reply briefly as the matched person.${lang === "zh-CN" ? " Use Simplified Chinese only." : " Use English only — no Chinese characters."}`,
      ),
      history: chatHistory.map((m) => ({
        role: (m.from === "me" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      })),
      userMessage: text,
    });
    setState((s) => {
      const next = receiveSimulatedReply(s, lang);
      const msgs = [...(next.chatMessages ?? [])];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].from === "them") {
          msgs[i] = { ...msgs[i], text: reply };
          break;
        }
      }
      return { ...next, chatMessages: msgs };
    });
    setThinking(false);
  }

  function handleBackToCandidate() {
    setState((s) => backToCandidate(s));
  }
  function handleDraftConsumed() {
    setState((s) => clearPendingDraft(s));
  }

  // "New topic" from the header — go home, focus composer, start fresh.
  function handleReset() {
    clearActiveThreadId();
    try {
      window.sessionStorage.setItem("kindred:home:focus", "1");
    } catch {
      /* noop */
    }
    void navigate({ to: "/" });
  }

  if (!ready || !hydrated || !sessionReady || !sessionId)
    return <div className="h-screen bg-background" />;

  const messages: AgentMsg[] = state.messages;
  const view = currentView(state);
  const showCanvas =
    view === "match" ||
    view === "chat" ||
    view === "publish" ||
    view === "mine";

  const placeholderKey =
    state.stage === "chat"
      ? "intent.left_placeholder_chat"
      : state.matchIntentId
        ? "intent.left_placeholder_match"
        : view === "publish"
          ? "intent.left_placeholder_publish"
          : view === "mine"
            ? "intent.left_placeholder_published"
            : state.stage === "published"
              ? "intent.left_placeholder_nomatch"
              : "chat.placeholder_first";

  return (
    <Workspace
      agentNameKey="agents.sidebyside.name"
      agentSubtitleKey="agents.sidebyside.tagline"
      placeholderKey={placeholderKey}
      messages={messages}
      thinking={thinking}
      onSend={handleSend}
      onReset={handleReset}
      onAskResolve={handleAskResolve}
      suggestions={state.suggestions?.length ? state.suggestions : undefined}
      hasCanvas={showCanvas}
      rightPane={
        showCanvas ? (
          <MeetCanvas
            state={state}
            onStartChat={handleStartChat}
            onRevoke={handleRevoke}
            onTryNearMiss={handleTryNearMiss}
            onSendChat={handleSendChat}
            onEditWish={handleEditWish}
            onSkip={handleSkip}
            onSeeNext={handleSeeNext}
            onSeePrev={handleSeePrev}
            canGoPrev={canGoPrev}
            onSave={handleSave}
            onUnsave={handleUnsave}
            onChatWithSaved={handleChatWithSaved}
            onRevokeReshare={handleRevokeReshare}
            onBackToCandidate={handleBackToCandidate}
            onDraftConsumed={handleDraftConsumed}
            onPublishResolve={handlePublishResolve}
            publishPlaceError={state.publishPlaceError}
            publishDisabled={thinking}
          />
        ) : null
      }
    />
  );
}
