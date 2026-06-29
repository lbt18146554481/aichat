import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { IntroCanvas } from "@/components/canvas/intro-canvas";
import {
  EMPTY,
  actAnotherAngle,
  actAnotherPerson,
  load,
  reset,
  save,
  start,
  userTurn,
  type MatchmakerState,
} from "@/lib/agents/matchmaker";

export const Route = createFileRoute("/matchmaker")({
  component: MatchmakerPage,
  head: () => ({
    meta: [
      { title: "Matchmaker — Kindred" },
      { name: "description", content: "Describe who you're looking for. The Matchmaker introduces one person at a time." },
    ],
  }),
});

function MatchmakerPage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  const [state, setState] = useState<MatchmakerState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    const loaded = load();
    setState(loaded.messages.length === 0 ? start(lang) : loaded);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  function send(text: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => userTurn(s, text, lang));
      setThinking(false);
    }, 500);
  }

  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    setState(start(lang));
  }

  function trigger(fn: (s: MatchmakerState, l: Lang) => MatchmakerState) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => fn(s, lang));
      setThinking(false);
    }, 450);
  }

  if (!hydrated) return <div className="h-screen bg-background" />;

  const messages: AgentMsg[] = state.messages;

  return (
    <Workspace
      agentNameKey="agents.matchmaker.name"
      agentSubtitleKey="agents.matchmaker.tagline"
      placeholderKey={state.phase === "clarifying" ? "chat.placeholder_first" : "chat.placeholder_followup"}
      messages={messages}
      thinking={thinking}
      onSend={send}
      onReset={handleReset}
      rightPane={
        <IntroCanvas
          state={state}
          onAnotherAngle={() => trigger(actAnotherAngle)}
          onAnotherPerson={() => trigger(actAnotherPerson)}
        />
      }
    />
  );
}
