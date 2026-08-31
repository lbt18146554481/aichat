import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { consumeSeed } from "@/lib/seed";
import { findMatch, findNearMisses, getIntentById } from "@/lib/intents";
import { getPersonById } from "@/lib/people";
import { lastTrait, rememberTrait } from "@/lib/agent-memory";
import { loadProfile } from "@/lib/profile";
import { normalizeLang } from "@/lib/lang";
import { isSaved as isSavedGlobal } from "@/lib/saved-intents";
import { polishAssistantText, sideBySideSystem } from "@/lib/llm-client";
import { requestDetectHandoff } from "@/lib/orchestrator-client";
import { requestSideBySideTurn } from "@/lib/side-by-side-client";
import type { SideTurnAction } from "@/lib/side-llm.server";
import type { HandoffContext } from "@/lib/handoff";
import {
  graftFromSide,
  markSessionSuspended,
  openMatchmakerFromHandoff,
} from "@/lib/session-handoff";
import { MAX_HANDOFF_COUNT } from "@/lib/handoff";
import {
  EMPTY,
  applyTurnResult,
  backToCandidate,
  beginStreamingTurn,
  clearPendingDraft,
  currentView,
  load,
  patchLastAssistant,
  patchWish,
  prepareSkipMatch,
  receiveSimulatedReply,
  revokeAndReset,
  save,
  sendChatMessage,
  setAwaitingTrait,
  setPendingDraft,
  saveCurrent,
  unsave,
  chatWithSaved,
  startChat,
  tryNearMiss,
  uid,
  type ChipAction,
  type LevelTier,
  type SideMsg,
  type SideState,
  type WhenTier,
} from "@/lib/agents/side-by-side";
import { ensureSessionsHydrated } from "@/lib/sessions";

export const Route = createFileRoute("/side-by-side")({
  validateSearch: (raw: Record<string, unknown>) => ({
    session: typeof raw.session === "string" ? raw.session : "",
    chatWith: typeof raw.chatWith === "string" ? raw.chatWith : "",
  }),
  component: SideBySidePage,
  head: () => ({
    meta: [
      { title: "Side by Side — Maitri" },
      { name: "description", content: "Two-way match on something you both already want to do." },
    ],
  }),
});

function msg(role: "user" | "assistant", text: string, chips?: SideMsg["chips"]): SideMsg {
  return { id: uid(), role, t: Date.now(), text, ...(chips ? { chips } : {}) };
}

// Chips attached to the Agent message when a match arrives.
function matchChips(t: TFunction): SideMsg["chips"] {
  return [
    {
      id: "chip-about",
      label: t("intent.chip_about_person"),
      action: { type: "ask_about_person" },
    },
    { id: "chip-opener", label: t("intent.chip_ask_opener"), action: { type: "ask_opener" } },
    { id: "chip-newtype", label: t("intent.chip_new_type"), action: { type: "request_new_type" } },
  ];
}

/** Chips only (no fixed narration) when published but no match. */
function nomatchChips(state: SideState, t: TFunction): SideMsg["chips"] {
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  if (!mine) return [];
  const refineChips: SideMsg["chips"] = [];
  if (mine.whenAny) {
    refineChips.push(
      {
        id: "w-weekend",
        label: t("meet.when.weekend"),
        action: { type: "refine_when", value: "weekend" },
      },
      {
        id: "w-weeknight",
        label: t("meet.when.weeknight"),
        action: { type: "refine_when", value: "weeknight" },
      },
    );
  }
  if (mine.levelAny && (mine.kind === "tennis" || mine.kind === "climb")) {
    refineChips.push(
      {
        id: "l-beginner",
        label: t("meet.level.beginner"),
        action: { type: "refine_level", value: "beginner" },
      },
      {
        id: "l-intermediate",
        label: t("meet.level.intermediate"),
        action: { type: "refine_level", value: "intermediate" },
      },
      {
        id: "l-advanced",
        label: t("meet.level.advanced"),
        action: { type: "refine_level", value: "advanced" },
      },
    );
  }
  const fallbackChips: SideMsg["chips"] = [];
  if (refineChips.length === 0 && state.nearMissIds.length > 0) {
    fallbackChips.push({
      id: "nm-" + state.nearMissIds[0],
      label: t("intent.chip_try_near_miss"),
      action: { type: "try_near_miss", intentId: state.nearMissIds[0] },
    });
  }
  fallbackChips.push(
    { id: "check-back", label: t("intent.chip_check_back"), action: { type: "check_back" } },
    { id: "revoke", label: t("intent.chip_switch"), action: { type: "revoke" } },
  );
  return [...refineChips, ...fallbackChips];
}

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
  const bootedRef = useRef(false);
  const handoffWishFired = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setSessionReady(false);
      return;
    }
    let cancelled = false;
    setSessionReady(false);
    bootedRef.current = false;
    handoffWishFired.current = false;
    void (async () => {
      await ensureSessionsHydrated();
      if (cancelled) return;
      setState(load(sessionId));
      setSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const withMatchChips = (next: SideState, prevMatchId: string | null): SideState => {
    if (!next.matchIntentId || next.matchIntentId === prevMatchId) return next;
    const msgs = [...next.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      msgs[msgs.length - 1] = { ...last, chips: matchChips(t) };
    }
    return { ...next, messages: msgs };
  };

  const withNomatchChips = (next: SideState): SideState => {
    if (next.stage !== "published" || next.matchIntentId) return next;
    const chips = nomatchChips(next, t);
    if (!chips?.length) return next;
    const msgs = [...next.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      msgs[msgs.length - 1] = { ...last, chips };
    }
    return { ...next, messages: msgs };
  };

  const withPublishConfirmAsk = (next: SideState): SideState => {
    if (!next.pendingConfirm || next.myIntentId) return next;
    const msgs = [...next.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant" && !last.ask) {
      msgs[msgs.length - 1] = {
        ...last,
        ask: {
          kind: "confirm",
          id: "publish-" + Date.now(),
          confirmLabel: t("intent.publish_confirm"),
          cancelLabel: t("intent.publish_edit"),
        },
      };
    }
    return { ...next, messages: msgs };
  };

  const runTurn = async (opts: {
    action: SideTurnAction;
    userMessage?: string;
    userTextForState?: string | null;
    seed?: string;
    preferredTrait?: string;
    stateOverride?: SideState;
  }) => {
    setThinking(true);
    const baseState = opts.stateOverride ?? stateRef.current;
    const prevMatch = baseState.matchIntentId;
    const userText = opts.userTextForState ?? opts.userMessage ?? null;
    let streaming = false;
    try {
      const output = await requestSideBySideTurn({
        lang,
        action: opts.action,
        userMessage: opts.userMessage,
        seed: opts.seed,
        preferredTrait: opts.preferredTrait ?? lastTrait() ?? undefined,
        state: baseState,
        onDelta: (text) => {
          if (!streaming) {
            streaming = true;
            setState(() => beginStreamingTurn(baseState, userText));
            setThinking(false);
          }
          setState((s) => patchLastAssistant(s, text));
        },
      });

      if (output.handoffTo === "matchmaker" && opts.userMessage) {
        performHandoffToMatchmaker({
          userMessage: opts.userMessage,
          summary: output.handoffSummary || opts.userMessage,
          transitionReply: output.transitionReply || output.reply,
          revoke: false,
        });
        return;
      }

      setState((s) => {
        let next = applyTurnResult(
          streaming ? s : baseState,
          streaming ? null : userText,
          output,
          streaming ? { skipUser: true, replaceLastAssistant: true } : undefined,
        );
        next = withPublishConfirmAsk(next);
        next = withMatchChips(next, prevMatch);
        next = withNomatchChips(next);
        return next;
      });
    } catch (e) {
      console.error("[side-by-side]", e);
    } finally {
      setThinking(false);
    }
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

  // Opening: LLM start when empty (skip if handoff already grafted messages).
  // Seed / pending wish fire their own message turns below.
  useEffect(() => {
    if (!hydrated || !sessionReady || !sessionId || bootedRef.current) return;
    if (state.messages.length > 0) {
      bootedRef.current = true;
      return;
    }
    if (pendingSeed || state.pendingWishText?.trim()) {
      // Let seed / handoff effects own the first turn.
      bootedRef.current = true;
      return;
    }
    bootedRef.current = true;
    void runTurn({ action: "start", preferredTrait: lastTrait() ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionReady, sessionId]);

  // Handoff from Matchmaker/home: auto-run pending wish once.
  useEffect(() => {
    if (!hydrated || !sessionReady || handoffWishFired.current) return;
    const wish = state.pendingWishText?.trim();
    if (!wish || state.myIntentId || state.stage !== "prompt") return;
    handoffWishFired.current = true;
    const city = loadProfile().city.trim();
    if (!city) return;
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

  async function respondAboutPerson(userText: string) {
    setThinking(true);
    const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
    const person = other ? getPersonById(other.ownerId) : null;
    const brief = person?.personBrief
      ? lang === "zh-CN"
        ? person.personBrief.zh
        : person.personBrief.en
      : t("intent.agent_no_brief");
    const assistantMsg = msg("assistant", brief);
    setState((s) => ({
      ...s,
      messages: [...s.messages, msg("user", userText), assistantMsg],
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

  function respondOpener(userText: string, forChat: boolean) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const other = s.matchIntentId ? getIntentById(s.matchIntentId) : null;
        const person = other ? getPersonById(other.ownerId) : null;
        const line = person?.openerSuggestion
          ? lang === "zh-CN"
            ? person.openerSuggestion.zh
            : person.openerSuggestion.en
          : null;
        if (!line) {
          return {
            ...s,
            messages: [
              ...s.messages,
              msg("user", userText),
              msg("assistant", t("intent.agent_no_opener")),
            ],
          };
        }
        const chipAction: ChipAction = forChat
          ? { type: "use_draft", text: line }
          : { type: "start_chat_with_draft", text: line };
        const chipLabel = forChat ? t("intent.chip_use_draft") : t("intent.chip_start_with_draft");
        const body = `${t("intent.agent_opener_lead")}\n\n"${line}"`;
        return {
          ...s,
          messages: [
            ...s.messages,
            msg("user", userText),
            msg("assistant", body, [
              { id: "chip-draft-" + Date.now(), label: chipLabel, action: chipAction },
            ]),
          ],
        };
      });
      setThinking(false);
    }, 320);
  }

  function respondReplyHint(userText: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const other = s.matchIntentId ? getIntentById(s.matchIntentId) : null;
        const person = other ? getPersonById(other.ownerId) : null;
        const hints = person?.replyHints
          ? lang === "zh-CN"
            ? person.replyHints.zh
            : person.replyHints.en
          : null;
        const line = hints && hints.length > 0 ? hints[s.chatMessages.length % hints.length] : null;
        if (!line) {
          return {
            ...s,
            messages: [
              ...s.messages,
              msg("user", userText),
              msg("assistant", t("intent.agent_no_reply_hint")),
            ],
          };
        }
        const body = `${t("intent.agent_reply_lead")}\n\n"${line}"`;
        return {
          ...s,
          messages: [
            ...s.messages,
            msg("user", userText),
            msg("assistant", body, [
              {
                id: "chip-usedraft-" + Date.now(),
                label: t("intent.chip_use_draft"),
                action: { type: "use_draft", text: line },
              },
            ]),
          ],
        };
      });
      setThinking(false);
    }, 320);
  }

  async function askForTrait(userText: string) {
    setThinking(true);
    const fallback = t("intent.ask_trait_fallback");
    setState((s) =>
      setAwaitingTrait(
        {
          ...s,
          messages: [...s.messages, msg("user", userText), msg("assistant", fallback)],
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

    // Mid-conversation switch to Matchmaker (async detect).
    void (async () => {
      const count = state.handoffCount ?? 0;
      if (count < MAX_HANDOFF_COUNT && sessionId) {
        try {
          const det = await requestDetectHandoff({
            lang: lang === "zh-CN" ? "zh-CN" : "en",
            currentAgent: "sidebyside",
            userMessage: text,
            history: state.messages.map((m) => ({ role: m.role, content: m.text })),
            handoffCount: count,
          });
          if (det.handoffTo === "matchmaker") {
            if (det.askRevokeWish && state.myIntentId) {
              setState((s) => ({
                ...s,
                pendingHandoff: {
                  target: "matchmaker",
                  summary: det.summary || text,
                  transitionReply: det.transitionReply,
                  userMessage: text,
                },
                messages: [
                  ...s.messages,
                  msg("user", text),
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
            performHandoffToMatchmaker({
              userMessage: text,
              summary: det.summary || text,
              transitionReply: det.transitionReply,
              revoke: false,
            });
            return;
          }
        } catch (e) {
          console.warn("[side-by-side handoff detect]", e);
        }
      }

      handleSendContinue(text);
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
    markSessionSuspended(sessionId);
    const next = openMatchmakerFromHandoff(handoff);
    void navigate({ to: "/matchmaker", search: { session: next.id } });
  }

  function handleSendContinue(text: string) {
    // Route by keyword when we're in a match or chat context.
    if (state.stage === "published" && state.matchIntentId) {
      const q = classify(text);
      if (q === "new_activity") return startNewActivity(text);
      if (q === "new_type") return askForTrait(text);
      if (q === "about_person") return respondAboutPerson(text);
      if (q === "opener") return respondOpener(text, /*forChat*/ false);
      if (q === "reply_hint") return respondReplyHint(text);
      // Otherwise fall through to submitPrompt (user is publishing a new wish).
    }
    if (state.stage === "chat") {
      const q = classify(text);
      if (q === "new_activity") return startNewActivity(text);
      if (q === "about_person") return respondAboutPerson(text);
      if (q === "opener") return respondOpener(text, /*forChat*/ true);
      if (q === "reply_hint") return respondReplyHint(text);
      if (q === "new_type") {
        setState((s) => ({ ...s, stage: "published", chatMessages: [] }));
        void askForTrait(text);
        return;
      }
      // Fall through: user typed a new wish mid-chat — publish it.
    }

    // City gate: matching is city-scoped. We no longer redirect to /profile
    // NOR write back to Profile. Instead the Agent asks inline for a city
    // to use *just for this wish*; the answer flows through as a one-shot
    // cityOverride and Profile is left untouched.
    const city = loadProfile().city.trim();
    if (!city) {
      setState((s) => ({
        ...s,
        pendingWishText: text,
        messages: [
          ...s.messages,
          msg("user", text),
          {
            id: uid(),
            role: "assistant",
            t: Date.now(),
            text: t("intent.ask_city_prompt"),
            ask: {
              kind: "text",
              id: "city-" + Date.now(),
              placeholder: t("intent.ask_city_placeholder"),
              confirmLabel: t("ask.continue"),
            },
          },
        ],
      }));
      return;
    }

    void runTurn({ action: "message", userMessage: text, userTextForState: text });
  }

  function handleAskResolve(askId: string, value: string | null) {
    // City ask: value=null means cancel — drop the pending wish.
    if (askId.startsWith("city-")) {
      if (value === null) {
        setState((s) => ({
          ...s,
          pendingWishText: undefined,
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
      // Mark the ask resolved (one-shot pill), then replay the wish with the
      // temporary city override. Profile is NOT touched.
      setState((s) => {
        const nextMessages = s.messages.map((m) =>
          m.ask?.id === askId
            ? {
                ...m,
                ask: undefined,
                askResolvedLabel: t("ask.resolved_city_once", { city: trimmed }),
              }
            : m,
        );
        return { ...s, messages: nextMessages, pendingWishText: undefined };
      });
      const wish = state.pendingWishText;
      if (wish) {
        const withCity = {
          ...stateRef.current,
          pendingWishText: undefined,
          wishDraft: {
            ...(stateRef.current.wishDraft ?? { kind: null, rawText: wish, whenAny: true, levelAny: true }),
            rawText: wish,
            city: trimmed,
            city_zh: trimmed,
          },
        };
        void runTurn({
          action: "message",
          userMessage: wish,
          userTextForState: wish,
          stateOverride: withCity,
        });
      }
      return;
    }
    if (askId.startsWith("publish-")) {
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? {
                ...m,
                ask: undefined,
                askResolvedLabel:
                  value === "confirm" ? t("intent.publish_confirmed") : t("intent.publish_keep_editing"),
              }
            : m,
        ),
      }));
      if (value === "confirm") {
        void runTurn({ action: "confirm_publish", userTextForState: null });
      } else {
        setState((s) => ({ ...s, pendingConfirm: null }));
      }
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

  function handleChipClick(rawAction: unknown) {
    const a = rawAction as ChipAction;
    switch (a.type) {
      case "refine_when":
        setState((s) => patchWish(s, { when: a.value as WhenTier }));
        void runTurn({ action: "rematch", userTextForState: t(`meet.when.${a.value}`) });
        break;
      case "refine_level":
        setState((s) => patchWish(s, { level: a.value as LevelTier }));
        void runTurn({ action: "rematch", userTextForState: t(`meet.level.${a.value}`) });
        break;
      case "start_chat":
        actWith((s) => startChat(s, undefined, lang));
        break;
      case "start_chat_with_draft":
        actWith((s) => startChat(s, a.text, lang));
        break;
      case "use_draft":
        setState((s) => setPendingDraft(s, a.text));
        break;
      case "ask_about_person":
        respondAboutPerson(t("intent.chip_about_person"));
        break;
      case "ask_opener":
        respondOpener(t("intent.chip_ask_opener"), state.stage === "chat");
        break;
      case "request_new_type":
        askForTrait(t("intent.chip_new_type"));
        break;
      case "try_near_miss": {
        const prepared = tryNearMiss(stateRef.current, a.intentId);
        setState(prepared);
        void runTurn({ action: "rematch", userTextForState: null, stateOverride: prepared });
        break;
      }
      case "revoke":
        askRevokeConfirm();
        break;
      case "check_back":
        // Wish stays published; user goes back to home. The session stays
        // in History — clicking it later re-runs the match on mount.
        void navigate({ to: "/" });
        break;
    }
  }

  // Right-pane actions are silent on the left Agent — they don't inject
  // narration into the private chat. The user's own typed prompts still do.
  function handleStartChat() {
    setState((s) => startChat(s, undefined, lang));
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
    const prepared = prepareSkipMatch(stateRef.current);
    setState(prepared);
    void runTurn({ action: "skip_match", userTextForState: null, stateOverride: prepared });
  }
  function handleRevokeReshare() {
    setState((s) => revokeAndReset(s, sessionId));
  }
  async function handleSendChat(text: string) {
    setState((s) => sendChatMessage(s, text));
    setThinking(true);
    const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
    const person = other ? getPersonById(other.ownerId) : null;
    const fallback = t("intent.chat_fallback");
    const reply = await polishAssistantText({
      fallback,
      system: sideBySideSystem(
        lang,
        person
          ? `You are roleplaying as ${person.name}. ${person.portrait}. Reply briefly as them in the activity chat.${lang === "zh-CN" ? " Use Simplified Chinese only." : " Use English only — no Chinese characters."}`
          : `Reply briefly as the matched person.${lang === "zh-CN" ? " Use Simplified Chinese only." : " Use English only — no Chinese characters."}`,
      ),
      history: (state.chatMessages ?? []).slice(-8).map((m) => ({
        role: (m.from === "me" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      })),
      userMessage: text,
    });
    setState((s) => {
      const next = receiveSimulatedReply(s, lang);
      // overwrite last them bubble if present
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

  // "New wish" from the header — go home, focus composer, start fresh.
  function handleReset() {
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
  const placeholderKey =
    state.stage === "chat"
      ? "intent.left_placeholder_chat"
      : state.matchIntentId
        ? "intent.left_placeholder_match"
        : "chat.placeholder_first";

  const view = currentView(state);
  const showCanvas = view === "match" || view === "chat";

  return (
    <Workspace
      agentNameKey="agents.sidebyside.name"
      agentSubtitleKey="agents.sidebyside.tagline"
      placeholderKey={placeholderKey}
      messages={messages}
      thinking={thinking}
      onSend={handleSend}
      onReset={handleReset}
      onChipClick={handleChipClick}
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
            onSave={handleSave}
            onUnsave={handleUnsave}
            onChatWithSaved={handleChatWithSaved}
            onRevokeReshare={handleRevokeReshare}
            onBackToCandidate={handleBackToCandidate}
            onDraftConsumed={handleDraftConsumed}
          />
        ) : null
      }
    />
  );
}
