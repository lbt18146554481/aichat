import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { IntroCanvas } from "@/components/canvas/intro-canvas";
import { consumeFocusPerson, consumeSeed } from "@/lib/seed";
import {
  EMPTY,
  actAnotherPerson,
  focusPerson,
  load,
  save,
  seeNextPerson,
  start,
  suggestChips,
  userTurn,
  type MatchmakerState,
} from "@/lib/agents/matchmaker";

export const Route = createFileRoute("/matchmaker")({
  validateSearch: (raw: Record<string, unknown>) => ({
    session: typeof raw.session === "string" ? raw.session : "",
  }),
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
  const navigate = useNavigate();
  const search = Route.useSearch();
  const sessionId = search.session || null;

  // Every matchmaker page must live under a session; no sessionId → home.
  useEffect(() => {
    if (!sessionId) void navigate({ to: "/" });
  }, [sessionId, navigate]);

  // Consume any homepage-seeded prompt exactly once.
  const [pendingSeed, setPendingSeed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return consumeSeed("matchmaker");
  });

  const [state, setState] = useState<MatchmakerState>(() => {
    if (typeof window === "undefined") return EMPTY;
    if (!sessionId) return EMPTY;
    const loaded = load(sessionId);
    const base = loaded.messages.length === 0 ? start(lang) : loaded;
    const focusId = consumeFocusPerson();
    return focusId ? focusPerson(base, focusId) : base;
  });
  const [hydrated, setHydrated] = useState(false);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && sessionId) save(state, sessionId);
  }, [state, hydrated, sessionId]);

  // Consume the homepage-seeded prompt as the first user turn.
  useEffect(() => {
    if (!hydrated || !pendingSeed) return;
    const text = pendingSeed;
    setPendingSeed(null);
    send(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, pendingSeed]);

  function send(text: string) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => userTurn(s, text, lang));
      setThinking(false);
    }, 500);
  }

  function handleReset() {
    if (!confirm("Start over?")) return;
    setState(start(lang));
  }

  function trigger(fn: (s: MatchmakerState, l: Lang) => MatchmakerState) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => fn(s, lang));
      setThinking(false);
    }, 450);
  }

  if (!hydrated || !sessionId) return <div className="h-screen bg-background" />;

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
      suggestions={suggestChips(state, lang)}
      rightPane={
        <IntroCanvas
          state={state}
          sessionId={sessionId}
          onPassAndNext={() => trigger(actAnotherPerson)}
          onSeeNextPerson={() => trigger(seeNextPerson)}
        />
      }
    />
  );
}
