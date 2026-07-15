import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { consumeSeed } from "@/lib/seed";
import { findMatch, findNearMisses, getIntentById } from "@/lib/intents";
import { getPersonById } from "@/lib/people";
import { lastTrait, rememberTrait } from "@/lib/agent-memory";
import type { Lang } from "@/lib/i18n";
import {
  EMPTY,
  backToCandidate,
  clearPendingDraft,
  currentView,
  editWish,
  load,
  receiveSimulatedReply,
  refineLevel,
  refineWhen,
  
  revokeAndReset,
  save,
  sendChatMessage,
  setAwaitingTrait,
  setPendingDraft,
  skipMatch,
  
  startChat,
  submitPrompt,
  tryNearMiss,
  uid,
  type ChipAction,
  type LevelTier,
  type SideMsg,
  type SideState,
  type WhenTier,
} from "@/lib/agents/side-by-side";



export const Route = createFileRoute("/side-by-side")({
  validateSearch: (raw: Record<string, unknown>) => ({
    session: typeof raw.session === "string" ? raw.session : "",
  }),
  component: SideBySidePage,
  head: () => ({
    meta: [
      { title: "Side by Side — Kindred" },
      { name: "description", content: "Two-way match on something you both already want to do." },
    ],
  }),
});

function msg(role: "user" | "assistant", text: string, chips?: SideMsg["chips"]): SideMsg {
  return { id: uid(), role, t: Date.now(), text, ...(chips ? { chips } : {}) };
}

function summarize(intentId: string | null, t: TFunction): string {
  if (!intentId) return "";
  const it = getIntentById(intentId);
  if (!it) return "";
  const kindLabel = t(`activity.kind.${it.kind}`);
  const parts: string[] = [kindLabel];
  if (!it.whenAny) {
    const when = (it.day === "sat" || it.day === "sun") ? "weekend"
      : it.window === "evening" ? "weeknight" : "any";
    parts.push(t(`meet.when.${when}`));
  }
  if (!it.levelAny && (it.kind === "tennis" || it.kind === "climb")) {
    parts.push(t(`meet.level.${it.level}`));
  }
  return parts.join(" · ");
}

// Chips attached to the Agent message when a match arrives.
// These are the three things you'd realistically ask a private advisor.
function matchChips(t: TFunction): SideMsg["chips"] {
  return [
    { id: "chip-about",  label: t("intent.chip_about_person"), action: { type: "ask_about_person" } },
    { id: "chip-opener", label: t("intent.chip_ask_opener"),   action: { type: "ask_opener" } },
    { id: "chip-newtype",label: t("intent.chip_new_type"),     action: { type: "request_new_type" } },
  ];
}

function narrate(state: SideState, prev: SideState, t: TFunction): SideMsg | null {
  const view = currentView(state);
  const truncated = state.truncated ? `${t("meet.truncated_hint")}\n\n` : "";

  if (view === "match") {
    // Only announce a new match when it wasn't already there.
    if (prev.matchIntentId === state.matchIntentId) return null;
    return msg(
      "assistant",
      truncated + t("intent.narrate_matched", { summary: summarize(state.myIntentId, t) }),
      matchChips(t),
    );
  }

  if (view === "nomatch") {
    const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
    if (!mine) return null;
    const refineChips: SideMsg["chips"] = [];
    if (mine.whenAny) {
      refineChips.push(
        { id: "w-weekend",   label: t("meet.when.weekend"),   action: { type: "refine_when", value: "weekend" } },
        { id: "w-weeknight", label: t("meet.when.weeknight"), action: { type: "refine_when", value: "weeknight" } },
      );
    }
    if (mine.levelAny && (mine.kind === "tennis" || mine.kind === "climb")) {
      refineChips.push(
        { id: "l-beginner",     label: t("meet.level.beginner"),     action: { type: "refine_level", value: "beginner" } },
        { id: "l-intermediate", label: t("meet.level.intermediate"), action: { type: "refine_level", value: "intermediate" } },
        { id: "l-advanced",     label: t("meet.level.advanced"),     action: { type: "refine_level", value: "advanced" } },
      );
    }

    // Fallback chips (always present in nomatch): "look at near-miss",
    // "I'll check back later" (go home), "cancel this wish".
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
      { id: "revoke",     label: t("intent.chip_switch"),     action: { type: "revoke" } },
    );

    const chips = [...refineChips, ...fallbackChips];
    if (refineChips.length === 0) {
      return msg("assistant",
        truncated + t("intent.narrate_nomatch_wait", { summary: summarize(state.myIntentId, t) }),
        chips);
    }
    const askKind = mine.whenAny ? "when" : "level";
    return msg("assistant",
      truncated + t("intent.narrate_nomatch_ask", {
        summary: summarize(state.myIntentId, t),
        ask: t(`intent.ask_${askKind}`),
      }),
      chips);
  }

  return null;
}

// ---- Question detection (demo keyword matching, not real NLU) --------
type Question = "about_person" | "opener" | "reply_hint" | "new_type" | "new_activity" | null;

function classify(text: string): Question {
  const s = text.toLowerCase();
  // "new activity" — user wants to change what they're doing entirely
  if (/(换件事|换个事|换件别的|做点别的|别的事|做别的|new wish|new activity|something else|different thing)/i.test(text)) return "new_activity";
  // "different kind of person" — same activity, different TA
  if (/(不一样的人|换个人|换一个|其他人|别的人|different person|someone else|someone different|other kind)/i.test(text)) return "new_type";
  // Draft an opener
  if (/(开场白|怎么开始|怎么打招呼|想句话|想一句|opener|first line|first message|what to say|how to start)/i.test(text)) return "opener";
  // Reply hint
  if (/(怎么回|回什么|想不出|怎么答|help me reply|what should i say|what to reply|not sure how)/i.test(text)) return "reply_hint";
  // Who is TA
  if (/(TA 是|ta是|什么样的人|介绍.*TA|介绍下|介绍一下|多讲讲|讲讲 TA|讲讲ta|who is|tell me about|more about|what.*they like)/i.test(text)) return "about_person";
  return null;
}

function SideBySidePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const search = Route.useSearch();
  const sessionId = search.session || null;

  // Consume the homepage-seeded prompt exactly once. consumeSeed() removes the
  // value from sessionStorage on read, so we must not call it twice.
  const [pendingSeed, setPendingSeed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return consumeSeed("sidebyside");
  });

  const [state, setState] = useState<SideState>(() => {
    if (typeof window === "undefined") return EMPTY;
    if (!sessionId) return EMPTY;
    return load(sessionId);
  });

  const [hydrated, setHydrated] = useState(false);
  const [thinking, setThinking] = useState(false);

  // Every side-by-side page must live under a session; no id → home.
  useEffect(() => {
    if (!sessionId) void navigate({ to: "/" });
  }, [sessionId, navigate]);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { if (hydrated && sessionId) save(state, sessionId); }, [state, hydrated, sessionId]);


  // Opening message — if the Agent already remembers a preferred trait from a
  // previous activity, lead with it. Otherwise the plain opener.
  useEffect(() => {
    if (!hydrated) return;
    if (state.messages.length === 0) {
      const trait = lastTrait();
      const opening = trait
        ? t("intent.memory_prefix", { trait }) + "\n\n" + t("meet.opening")
        : t("meet.opening");
      setState((s) => ({ ...s, messages: [msg("assistant", opening)] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Re-run match on mount — when the user returns from History, this is
  // their "peek and see if someone showed up while I was gone". Only runs
  // once per hydration for a still-waiting wish.
  useEffect(() => {
    if (!hydrated) return;
    if (state.stage !== "published" || state.matchIntentId) return;
    if (!state.myIntentId) return;
    const mine = getIntentById(state.myIntentId);
    if (!mine) return;
    const hit = findMatch(mine, { exclude: state.triedIntentIds });
    if (hit) {
      setState((s) => ({ ...s, matchIntentId: hit.id, nearMissIds: [] }));
      return;
    }
    const nears = findNearMisses(mine, { exclude: state.triedIntentIds });
    setState((s) => ({ ...s, nearMissIds: nears.map((n) => n.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Consume the homepage-seeded prompt automatically.
  useEffect(() => {
    if (!hydrated || !pendingSeed) return;
    const text = pendingSeed;
    setPendingSeed(null);
    handleSend(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, pendingSeed]);

  function actWith(mutate: (s: SideState) => SideState, userText?: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const withUser: SideState = userText
          ? { ...s, messages: [...s.messages, msg("user", userText)] }
          : s;
        const next = mutate(withUser);
        const narr = narrate(next, s, t);
        return narr ? { ...next, messages: [...next.messages, narr] } : next;
      });
      setThinking(false);
    }, 320);
  }

  // ---- Agent-Q&A replies -------------------------------------------------
  // These add an assistant message + (optionally) a chip. They do NOT
  // change the intent / match state.

  function respondAboutPerson(userText: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const other = s.matchIntentId ? getIntentById(s.matchIntentId) : null;
        const person = other ? getPersonById(other.ownerId) : null;
        const brief = person?.personBrief
          ? (lang === "zh-CN" ? person.personBrief.zh : person.personBrief.en)
          : t("intent.agent_no_brief");
        const nextMsgs = [
          ...s.messages,
          msg("user", userText),
          msg("assistant", brief),
        ];
        return { ...s, messages: nextMsgs };
      });
      setThinking(false);
    }, 320);
  }

  function respondOpener(userText: string, forChat: boolean) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const other = s.matchIntentId ? getIntentById(s.matchIntentId) : null;
        const person = other ? getPersonById(other.ownerId) : null;
        const line = person?.openerSuggestion
          ? (lang === "zh-CN" ? person.openerSuggestion.zh : person.openerSuggestion.en)
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
        const chipLabel = forChat
          ? t("intent.chip_use_draft")
          : t("intent.chip_start_with_draft");
        const body = `${t("intent.agent_opener_lead")}\n\n"${line}"`;
        return {
          ...s,
          messages: [
            ...s.messages,
            msg("user", userText),
            msg("assistant", body, [{ id: "chip-draft-" + Date.now(), label: chipLabel, action: chipAction }]),
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
          ? (lang === "zh-CN" ? person.replyHints.zh : person.replyHints.en)
          : null;
        const line = hints && hints.length > 0
          ? hints[s.chatMessages.length % hints.length]
          : null;
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
              { id: "chip-usedraft-" + Date.now(), label: t("intent.chip_use_draft"), action: { type: "use_draft", text: line } },
            ]),
          ],
        };
      });
      setThinking(false);
    }, 320);
  }

  function askForTrait(userText: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => setAwaitingTrait({
        ...s,
        messages: [
          ...s.messages,
          msg("user", userText),
          msg("assistant", t("intent.agent_ask_trait")),
        ],
      }, true));
      setThinking(false);
    }, 320);
  }

  function consumeTraitAndSkip(userText: string) {
    rememberTrait(userText);
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        // Clear the flag and skip to next match.
        const skipped = skipMatch({ ...s, awaitingTrait: false });
        const line = skipped.matchIntentId
          ? t("intent.agent_trait_saved")
          : t("intent.narrate_pool_exhausted");
        return {
          ...skipped,
          messages: [
            ...skipped.messages,
            msg("user", userText),
            msg("assistant", line),
          ],
        };
      });
      setThinking(false);
    }, 320);
  }

  function startNewActivity(userText?: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const cleared = revokeAndReset(s);
        const trait = lastTrait();
        const line = trait
          ? t("intent.narrate_new_activity_with_memory", { trait })
          : t("intent.narrate_new_activity");
        const nextMsgs: SideMsg[] = [
          ...(userText ? [msg("user", userText)] : []),
          msg("assistant", line),
        ];
        // Fresh conversation: drop prior messages, start clean.
        return { ...cleared, messages: nextMsgs };
      });
      setThinking(false);
    }, 320);
  }

  function handleSend(text: string) {
    // If we asked "what kind of person" and are waiting on a trait, treat
    // whatever they type next as the trait.
    if (state.awaitingTrait) {
      consumeTraitAndSkip(text);
      return;
    }

    // Route by keyword when we're in a match or chat context.
    if (state.stage === "published" && state.matchIntentId) {
      const q = classify(text);
      if (q === "new_activity") return startNewActivity(text);
      if (q === "new_type")     return askForTrait(text);
      if (q === "about_person") return respondAboutPerson(text);
      if (q === "opener")       return respondOpener(text, /*forChat*/ false);
      if (q === "reply_hint")   return respondReplyHint(text);
      // Otherwise fall through to submitPrompt (user is publishing a new wish).
    }
    if (state.stage === "chat") {
      const q = classify(text);
      if (q === "new_activity") return startNewActivity(text);
      if (q === "about_person") return respondAboutPerson(text);
      if (q === "opener")       return respondOpener(text, /*forChat*/ true);
      if (q === "reply_hint")   return respondReplyHint(text);
      if (q === "new_type") {
        // Not meaningful mid-chat; nudge back to candidate view.
        setState((s) => ({
          ...s,
          stage: "published",
          chatMessages: [],
          messages: [...s.messages, msg("user", text), msg("assistant", t("intent.agent_ask_trait"))],
          awaitingTrait: true,
        }));
        return;
      }
      // Fall through: user typed a new wish mid-chat — publish it.
    }

    actWith((s) => submitPrompt(s, text), text);
  }

  function handleChipClick(rawAction: unknown) {
    const a = rawAction as ChipAction;
    switch (a.type) {
      case "refine_when":
        actWith((s) => refineWhen(s, a.value as WhenTier), t(`meet.when.${a.value}`));
        break;
      case "refine_level":
        actWith((s) => refineLevel(s, a.value as LevelTier), t(`meet.level.${a.value}`));
        break;
      case "start_chat":
        actWith((s) => startChat(s));
        break;
      case "start_chat_with_draft":
        actWith((s) => startChat(s, a.text));
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
      case "try_near_miss":
        actWith((s) => tryNearMiss(s, a.intentId));
        break;
      case "revoke":
        actWith((s) => revokeAndReset(s));
        break;
      case "check_back":
        // Wish stays published; user goes back to home. Home banner will
        // surface it (waiting or matched) on next visit.
        void navigate({ to: "/" });
        break;
    }
  }

  function handleStartChat() { actWith((s) => startChat(s)); }
  function handleRevoke()    { actWith((s) => revokeAndReset(s)); }
  function handleTryNearMiss(intentId: string) { actWith((s) => tryNearMiss(s, intentId)); }
  function handleEditWish(patch: { when?: WhenTier; level?: LevelTier; location?: string }) {
    const bits: string[] = [];
    if (patch.when) bits.push(t(`meet.when.${patch.when}`));
    if (patch.level) bits.push(t(`meet.level.${patch.level}`));
    if (patch.location !== undefined && patch.location.trim()) bits.push(patch.location.trim());
    const userText = bits.length ? t("intent.edited_user_msg", { changes: bits.join(" · ") }) : undefined;
    actWith((s) => editWish(s, patch), userText);
  }
  function handleSkip() {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const next = skipMatch(s);
        const line = next.matchIntentId
          ? t("intent.narrate_next_match")
          : t("intent.narrate_pool_exhausted");
        return { ...next, messages: [...next.messages, msg("assistant", line)] };
      });
      setThinking(false);
    }, 320);
  }
  function handleRevokeReshare() {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const next = revokeAndReset(s);
        return { ...next, messages: [...next.messages, msg("assistant", t("intent.narrate_revoked"))] };
      });
      setThinking(false);
    }, 320);
  }
  function handleSendChat(text: string) {
    setState((s) => sendChatMessage(s, text));
    window.setTimeout(() => setState((s) => receiveSimulatedReply(s)), 900);
  }

  function handleBackToCandidate() { setState((s) => backToCandidate(s)); }
  function handleDraftConsumed()   { setState((s) => clearPendingDraft(s)); }

  // "New activity" from the header. Same semantic as before but no confirm —
  // the user has learned this means "reset the current wish and start clean".
  function handleReset() {
    startNewActivity();
  }

  if (!hydrated) return <div className="h-screen bg-background" />;

  const messages: AgentMsg[] = state.messages;
  const placeholderKey =
    state.stage === "chat"
      ? "intent.left_placeholder_chat"
      : state.matchIntentId
        ? "intent.left_placeholder_match"
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
      onChipClick={handleChipClick}
      rightPane={
        <MeetCanvas
          state={state}
          onStartChat={handleStartChat}
          onRevoke={handleRevoke}
          onTryNearMiss={handleTryNearMiss}
          onSendChat={handleSendChat}
          onEditWish={handleEditWish}
          onSkip={handleSkip}
          onRevokeReshare={handleRevokeReshare}
          onBackToCandidate={handleBackToCandidate}
          onDraftConsumed={handleDraftConsumed}
        />
      }
    />
  );
}
