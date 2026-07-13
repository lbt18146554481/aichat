import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { consumeSeed } from "@/lib/seed";
import { getIntentById } from "@/lib/intents";
import {
  EMPTY,
  currentView,
  editWish,
  load,
  receiveSimulatedReply,
  refineLevel,
  refineWhen,
  reset,
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
  type WhenTier,
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

function narrate(state: SideState, prev: SideState, t: TFunction): SideMsg | null {
  const view = currentView(state);
  const truncated = state.truncated ? `${t("meet.truncated_hint")}\n\n` : "";

  if (view === "match") {
    // Only announce a new match when it wasn't already there.
    if (prev.matchIntentId === state.matchIntentId) return null;
    return msg("assistant", truncated + t("intent.narrate_matched", { summary: summarize(state.myIntentId, t) }));
  }

  if (view === "nomatch") {
    const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
    if (!mine) return null;
    const chips: SideMsg["chips"] = [];
    if (mine.whenAny) {
      chips.push(
        { id: "w-weekend",   label: t("meet.when.weekend"),   action: { type: "refine_when", value: "weekend" } },
        { id: "w-weeknight", label: t("meet.when.weeknight"), action: { type: "refine_when", value: "weeknight" } },
      );
    }
    if (mine.levelAny && (mine.kind === "tennis" || mine.kind === "climb")) {
      chips.push(
        { id: "l-beginner",     label: t("meet.level.beginner"),     action: { type: "refine_level", value: "beginner" } },
        { id: "l-intermediate", label: t("meet.level.intermediate"), action: { type: "refine_level", value: "intermediate" } },
        { id: "l-advanced",     label: t("meet.level.advanced"),     action: { type: "refine_level", value: "advanced" } },
      );
    }
    if (chips.length === 0) {
      // Something was missing before but nothing helpful to ask now — plain narration.
      return msg("assistant", truncated + t("intent.narrate_nomatch", { summary: summarize(state.myIntentId, t) }));
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

function SideBySidePage() {
  const { t } = useTranslation();

  const [state, setState] = useState<SideState>(() => {
    if (typeof window === "undefined") return EMPTY;
    const seed = consumeSeed("sidebyside");
    if (seed) { reset(); return start(); }
    return load();
  });
  const [pendingSeed, setPendingSeed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return consumeSeed("sidebyside");
  });
  const [hydrated, setHydrated] = useState(false);
  const [thinking, setThinking] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  // Opening message.
  useEffect(() => {
    if (!hydrated) return;
    if (state.messages.length === 0) {
      setState((s) => ({ ...s, messages: [msg("assistant", t("meet.opening"))] }));
    }
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

  function handleSend(text: string) {
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
      case "try_near_miss":
        actWith((s) => tryNearMiss(s, a.intentId));
        break;
      case "revoke":
        actWith((s) => revokeAndReset(s));
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
