import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { consumeSeed } from "@/lib/seed";
import type { ActivityKind } from "@/lib/types";
import {
  ALL_KINDS,
  EMPTY,
  answerSlot,
  chooseFromFallback,
  currentView,
  load,
  receiveSimulatedReply,
  reset,
  resolveAmbiguity,
  revokeAndReset,
  save,
  sendChatMessage,
  start,
  startChat,
  submitPrompt,
  tryNearMiss,
  uid,
  type ChipAction,
  type LevelTier,
  type SideMsg,
  type SideState,
} from "@/lib/agents/side-by-side";

export const Route = createFileRoute("/side-by-side")({
  component: SideBySidePage,
  head: () => ({
    meta: [
      { title: "Side by Side — Kindred" },
      { name: "description", content: "Two-way match on something you both already want to do." },
    ],
  }),
});

// ---- Narration ------------------------------------------------------------

function collectingSummary(s: SideState, t: TFunction): string {
  const c = s.collecting;
  const bits: string[] = [];
  if (c.kind) bits.push(t(`activity.kind.${c.kind}`));
  if (c.when) bits.push(t(`meet.when.${c.when}`));
  if (c.level) bits.push(t(`meet.level.${c.level}`));
  return bits.join(" · ");
}

function msg(role: "user" | "assistant", text: string, chips?: SideMsg["chips"]): SideMsg {
  return { id: uid(), role, t: Date.now(), text, ...(chips ? { chips } : {}) };
}

function narrate(s: SideState, t: TFunction): SideMsg | null {
  const view = currentView(s);
  const truncatedPrefix = s.truncated ? `${t("meet.truncated_hint")}\n\n` : "";

  if (view === "fallback") {
    return msg("assistant", truncatedPrefix + t("meet.fallback_intro"),
      ALL_KINDS.map((k) => ({
        id: `fb-${k}`,
        label: t(`activity.kind.${k}`),
        action: { type: "choose_fallback", kind: k } as ChipAction,
      })));
  }

  if (view === "disambiguate") {
    return msg("assistant", truncatedPrefix + t("meet.disambiguate_ask"),
      (s.ambiguousKinds ?? []).map((k) => ({
        id: `da-${k}`,
        label: t(`activity.kind.${k}`),
        action: { type: "resolve_ambiguity", kind: k } as ChipAction,
      })));
  }

  if (view === "ask" && s.pendingAsk === "when" && s.collecting.kind) {
    const kindLabel = t(`activity.kind.${s.collecting.kind}`);
    const heard = collectingSummary(s, t);
    return msg("assistant",
      `${truncatedPrefix}${t("meet.heard", { summary: heard })}\n${t("meet.ask_when", { kind: kindLabel })}`,
      [
        { id: "w-weekend",   label: t("meet.when.weekend"),   action: { type: "answer_when", value: "weekend" } },
        { id: "w-weeknight", label: t("meet.when.weeknight"), action: { type: "answer_when", value: "weeknight" } },
        { id: "w-any",       label: t("meet.when.any"),       action: { type: "answer_when", value: "any" } },
      ]);
  }

  if (view === "ask" && s.pendingAsk === "level" && s.collecting.kind) {
    const kindLabel = t(`activity.kind.${s.collecting.kind}`);
    const heard = collectingSummary(s, t);
    return msg("assistant",
      `${truncatedPrefix}${t("meet.heard", { summary: heard })}\n${t("meet.ask_level", { kind: kindLabel })}`,
      [
        { id: "l-beginner",     label: t("meet.level.beginner"),     action: { type: "answer_level", value: "beginner" } },
        { id: "l-intermediate", label: t("meet.level.intermediate"), action: { type: "answer_level", value: "intermediate" } },
        { id: "l-advanced",     label: t("meet.level.advanced"),     action: { type: "answer_level", value: "advanced" } },
        { id: "l-any",          label: t("meet.level.any"),          action: { type: "answer_level", value: "any" } },
      ]);
  }

  if (view === "match") {
    return msg("assistant", t("intent.narrate_matched", { summary: collectingSummary(s, t) }));
  }

  if (view === "nomatch") {
    return msg("assistant", t("intent.narrate_nomatch", { summary: collectingSummary(s, t) }));
  }

  if (view === "chat") {
    return msg("assistant", t("intent.narrate_chat"));
  }

  return null;
}

// ---- Page ----------------------------------------------------------------

function SideBySidePage() {
  const { t } = useTranslation();

  const [state, setState] = useState<SideState>(() => {
    if (typeof window === "undefined") return EMPTY;
    const seed = consumeSeed("sidebyside");
    if (seed) { reset(); return start(); }
    return load();
  });
  const [hydrated, setHydrated] = useState(false);
  const [thinking, setThinking] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (state.messages.length === 0) {
      setState((s) => ({ ...s, messages: [msg("assistant", t("meet.opening"))] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function actWith(mutate: (s: SideState) => SideState, userText?: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => {
        const withUser: SideState = userText
          ? { ...s, messages: [...s.messages, msg("user", userText)] }
          : s;
        const next = mutate(withUser);
        const narr = narrate(next, t);
        return narr ? { ...next, messages: [...next.messages, narr] } : next;
      });
      setThinking(false);
    }, 350);
  }

  function handleSend(text: string) {
    // In chat stage, left composer talks to Agent — not the peer. Keep it simple:
    // treat prompts during chat as "new intent" attempts (fresh publish).
    actWith((s) => submitPrompt(s, text), text);
  }

  function handleChipClick(rawAction: unknown) {
    const a = rawAction as ChipAction;
    switch (a.type) {
      case "resolve_ambiguity":
        actWith((s) => resolveAmbiguity(s, a.kind), t(`activity.kind.${a.kind}`));
        break;
      case "choose_fallback":
        actWith((s) => chooseFromFallback(s, a.kind), t(`activity.kind.${a.kind}`));
        break;
      case "answer_when":
        actWith((s) => answerSlot(s, "when", a.value), t(`meet.when.${a.value}`));
        break;
      case "answer_level":
        actWith((s) => answerSlot(s, "level", a.value),
          a.value === "any" ? t("meet.level.any") : t(`meet.level.${a.value as LevelTier}`));
        break;
      case "start_chat":
        actWith((s) => startChat(s));
        break;
      case "try_near_miss":
        actWith((s) => tryNearMiss(s, a.intentId));
        break;
      case "suggest_kind":
        actWith((s) => chooseFromFallback(s, a.kind), t(`activity.kind.${a.kind}`));
        break;
      case "revoke":
        actWith((s) => revokeAndReset(s));
        break;
    }
  }

  function handleStartChat() {
    actWith((s) => startChat(s));
  }
  function handleRevoke() {
    actWith((s) => revokeAndReset(s));
  }
  function handleTryNearMiss(intentId: string) {
    actWith((s) => tryNearMiss(s, intentId));
  }
  function handleSendChat(text: string) {
    setState((s) => sendChatMessage(s, text));
    window.setTimeout(() => setState((s) => receiveSimulatedReply(s)), 900);
  }

  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    const s = start();
    setState({ ...s, messages: [msg("assistant", t("meet.opening"))] });
  }

  if (!hydrated) return <div className="h-screen bg-background" />;

  // Silence unused imports.
  const _kindAnchor: ActivityKind | null = null;
  void _kindAnchor;

  const messages: AgentMsg[] = state.messages;
  const placeholderKey =
    state.stage === "chat" ? "intent.left_placeholder_during_chat" : "chat.placeholder_first";

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
        />
      }
    />
  );
}
