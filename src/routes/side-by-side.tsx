import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Lang } from "@/lib/i18n";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { sayHello } from "@/lib/connections";
import { consumeSeed } from "@/lib/seed";
import type { ActivityKind, Weekday } from "@/lib/types";
import {
  ALL_KINDS,
  EMPTY,
  addToWaitlist,
  answerSlot,
  chooseFromFallback,
  currentView,
  load,
  makeOpener,
  reset,
  resolveAmbiguity,
  save,
  start,
  submitPrompt,
  swap,
  tryNearMiss,
  uid,
  type ChipAction,
  type LevelTier,
  type SideMsg,
  type SideState,
  type UserIntent,
  type WhenTier,
} from "@/lib/agents/side-by-side";

export const Route = createFileRoute("/side-by-side")({
  component: SideBySidePage,
  head: () => ({
    meta: [
      { title: "Side by Side — Kindred" },
      { name: "description", content: "Meet someone over something you both already do." },
    ],
  }),
});

// ---- Narration ------------------------------------------------------------

function heardSummary(intent: UserIntent, t: TFunction): string {
  const bits: string[] = [t(`activity.kind.${intent.kind}`)];
  if (intent.when)  bits.push(t(`meet.when.${intent.when}`));
  if (intent.level) bits.push(t(`meet.level.${intent.level}`));
  return bits.join(" · ");
}

function msg(role: "user" | "assistant", text: string, chips?: SideMsg["chips"]): SideMsg {
  return { id: uid(), role, t: Date.now(), text, ...(chips ? { chips } : {}) };
}

/** Compose the assistant reply for the new state (after an action). */
function narrate(s: SideState, t: TFunction): SideMsg | null {
  const view = currentView(s);
  const truncatedPrefix = s.truncated ? `${t("meet.truncated_hint")}\n\n` : "";

  if (view === "fallback") {
    return msg("assistant", truncatedPrefix + t("meet.fallback_intro"),
      ALL_KINDS.map<NonNullable<SideMsg["chips"]>[number]>((k) => ({
        id: `fb-${k}`,
        label: t(`activity.kind.${k}`),
        action: { type: "choose_fallback", kind: k },
      })));
  }

  if (view === "disambiguate") {
    return msg("assistant", truncatedPrefix + t("meet.disambiguate_ask"),
      (s.ambiguousKinds ?? []).map((k) => ({
        id: `da-${k}`,
        label: t(`activity.kind.${k}`),
        action: { type: "resolve_ambiguity", kind: k },
      })));
  }

  if (view === "ask" && s.pendingAsk === "when" && s.intent) {
    const kindLabel = t(`activity.kind.${s.intent.kind}`);
    const heard = heardSummary(s.intent, t);
    return msg("assistant",
      `${truncatedPrefix}${t("meet.heard", { summary: heard })}\n${t("meet.ask_when", { kind: kindLabel })}`,
      [
        { id: "w-weekend",   label: t("meet.when.weekend"),   action: { type: "answer_when", value: "weekend" } },
        { id: "w-weeknight", label: t("meet.when.weeknight"), action: { type: "answer_when", value: "weeknight" } },
        { id: "w-any",       label: t("meet.when.any"),       action: { type: "answer_when", value: "any" } },
      ]);
  }

  if (view === "ask" && s.pendingAsk === "level" && s.intent) {
    const kindLabel = t(`activity.kind.${s.intent.kind}`);
    const heard = heardSummary(s.intent, t);
    return msg("assistant",
      `${truncatedPrefix}${t("meet.heard", { summary: heard })}\n${t("meet.ask_level", { kind: kindLabel })}`,
      [
        { id: "l-beginner",     label: t("meet.level.beginner"),     action: { type: "answer_level", value: "beginner" } },
        { id: "l-intermediate", label: t("meet.level.intermediate"), action: { type: "answer_level", value: "intermediate" } },
        { id: "l-advanced",     label: t("meet.level.advanced"),     action: { type: "answer_level", value: "advanced" } },
        { id: "l-any",          label: t("meet.level.any"),          action: { type: "answer_level", value: "any" } },
      ]);
  }

  if (view === "candidate" && s.intent) {
    return msg("assistant", t("meet.found_mutual", { summary: heardSummary(s.intent, t) }));
  }

  if (view === "nearmiss" && s.intent) {
    const kindLabel = t(`activity.kind.${s.intent.kind}`);
    const whenLabel = s.intent.when ? t(`meet.when.${s.intent.when}`) : t("meet.when.any");

    if (s.poolExhausted) {
      return msg("assistant", t("meet.pool_exhausted_msg"));
    }

    const chips: NonNullable<SideMsg["chips"]> = [];

    // Waitlist chip — only if not already joined for this intent.
    if (!s.waitlistJoinedForCurrent) {
      chips.push({
        id: "wl-join",
        label: s.recalledFromWaitlist ? t("meet.waitlist_recalled_chip") : t("meet.waitlist_cta"),
        action: { type: "add_to_waitlist" },
      });
    }

    // Near-miss chip (top slot only, to keep chat clean; more in canvas).
    const top = s.nearMisses[0];
    if (top) {
      chips.push({
        id: "near",
        label: t("meet.near_try", {
          day: t(`activity.day.${top.slot.day}`),
          window: t(`activity.window.${top.slot.window}`),
        }),
        action: { type: "try_near_miss", slot: top.slot },
      });
    }

    // Sibling kind suggestions.
    for (const k of s.suggestKinds) {
      chips.push({
        id: `sk-${k}`,
        label: t("meet.suggest_kind_chip", { kind: t(`activity.kind.${k}`) }),
        action: { type: "suggest_kind", kind: k },
      });
    }

    const headline = s.recalledFromWaitlist
      ? t("meet.waitlist_recall_msg", { kind: kindLabel, when: whenLabel })
      : top
        ? t("meet.no_match_near", {
            count: top.personCount,
            day: t(`activity.day.${top.slot.day}`),
            window: t(`activity.window.${top.slot.window}`),
          })
        : t("meet.no_match_waitlist", { kind: kindLabel, when: whenLabel });

    return msg("assistant", headline, chips.length > 0 ? chips : undefined);
  }

  return null;
}

// ---- Page ----------------------------------------------------------------

function SideBySidePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();

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

  // Seed the opening assistant message once, after i18n is ready.
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
    }, 450);
  }

  function handleSend(text: string) {
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
      case "try_near_miss":
        actWith((s) => tryNearMiss(s, a.slot),
          t("meet.near_try", {
            day: t(`activity.day.${a.slot.day}`),
            window: t(`activity.window.${a.slot.window}`),
          }));
        break;
      case "suggest_kind":
        actWith((s) => chooseFromFallback(s, a.kind),
          t("meet.suggest_kind_chip", { kind: t(`activity.kind.${a.kind}`) }));
        break;
      case "add_to_waitlist":
        actWith((s) => addToWaitlist(s), t("meet.waitlist_cta"));
        break;
    }
  }

  function handleJoinWaitlist() {
    actWith((s) => addToWaitlist(s), t("meet.waitlist_cta"));
  }

  function handleSwap() {
    actWith((s) => swap(s));
  }

  function handleTryNearMiss(slot: { day: Weekday; window: "morning" | "midday" | "evening" }) {
    actWith((s) => tryNearMiss(s, slot),
      t("meet.near_try", {
        day: t(`activity.day.${slot.day}`),
        window: t(`activity.window.${slot.window}`),
      }));
  }

  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    const s = start();
    setState({ ...s, messages: [msg("assistant", t("meet.opening"))] });
  }

  function handleSayHello() {
    setState((current) => {
      if (!current.candidate || !current.intent) return current;
      const opener = makeOpener(current.candidate, current.intent, lang);
      sayHello(current.candidate.personId, { quotedMomentId: null, reply: opener });
      const next: SideState = {
        ...current,
        candidate: null,
        skipped: [...current.skipped, current.candidate.personId],
      };
      window.setTimeout(() => void navigate({ to: "/connections" }), 0);
      return next;
    });
  }

  if (!hydrated) return <div className="h-screen bg-background" />;

  // Silence unused import — keeps ActivityKind referenced for type inference stability.
  const _kindTypeAnchor: ActivityKind | null = null;
  void _kindTypeAnchor;

  const messages: AgentMsg[] = state.messages;

  return (
    <Workspace
      agentNameKey="agents.sidebyside.name"
      agentSubtitleKey="agents.sidebyside.tagline"
      placeholderKey="chat.placeholder_first"
      messages={messages}
      thinking={thinking}
      onSend={handleSend}
      onReset={handleReset}
      onChipClick={handleChipClick}
      rightPane={
        <MeetCanvas
          state={state}
          onSwap={handleSwap}
          onSayHello={handleSayHello}
          onTryNearMiss={handleTryNearMiss}
        />
      }
    />
  );
}
