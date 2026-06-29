import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { ResonanceCanvas } from "@/components/canvas/resonance-canvas";
import { consumeSeed } from "@/lib/seed";
import {
  EMPTY,
  load,
  reset,
  reveal,
  save,
  skip,
  start,
  userTurn,
  type CompassState,
} from "@/lib/agents/compass";

export const Route = createFileRoute("/compass")({
  component: CompassPage,
  head: () => ({
    meta: [
      { title: "Compass — Kindred" },
      { name: "description", content: "Answer a question. See someone whose answer resonates." },
    ],
  }),
});

function CompassPage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  const [state, setState] = useState<CompassState>(EMPTY);
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
    }, 600);
  }
  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    setState(start(lang));
  }
  function onReveal() { setState((s) => reveal(s, lang)); }
  function onSkip() {
    setThinking(true);
    window.setTimeout(() => { setState((s) => skip(s, lang)); setThinking(false); }, 400);
  }

  if (!hydrated) return <div className="h-screen bg-background" />;
  const messages: AgentMsg[] = state.messages;

  const placeholderOverride = state.phase === "asking"
    ? (lang === "zh-CN" ? "用你自己的话答…" : "Answer in your own words…")
    : (lang === "zh-CN" ? "继续，或说'下一题'" : "Continue, or say 'next'");

  return (
    <Workspace
      agentNameKey="agents.compass.name"
      agentSubtitleKey="agents.compass.tagline"
      placeholderKey="chat.placeholder_followup"
      placeholderOverride={placeholderOverride}
      messages={messages}
      thinking={thinking}
      onSend={send}
      onReset={handleReset}
      rightPane={<ResonanceCanvas state={state} onReveal={onReveal} onSkip={onSkip} />}
    />
  );
}
