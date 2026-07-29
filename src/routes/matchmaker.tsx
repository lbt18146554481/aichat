import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useEffect, useRef, useState } from "react";
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
  const { ready } = useRequireAuth();
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const search = Route.useSearch();
  const sessionId = search.session || null;

  // Every matchmaker page must live under a session; no sessionId → home.
  useEffect(() => {
    if (ready && !sessionId) void navigate({ to: "/" });
  }, [ready, sessionId, navigate]);

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
    try { window.sessionStorage.setItem("kindred:home:focus", "1"); } catch { /* noop */ }
    void navigate({ to: "/" });
  }

  function trigger(fn: (s: MatchmakerState, l: Lang) => MatchmakerState) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => fn(s, lang));
      setThinking(false);
    }, 450);
  }

  // Inline Agent ask when Say hello is blocked by a missing profile field.
  function handleNeedProfile(field: "name" | "city", personId: string) {
    const askId = `${field}-${personId}-${Date.now()}`;
    const prompt = field === "name"
      ? t("intro.ask_name_prompt")
      : t("intro.ask_city_prompt");
    const placeholder = field === "name"
      ? t("intro.ask_name_placeholder")
      : t("intro.ask_city_placeholder");
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          id: Math.random().toString(36).slice(2, 10),
          role: "assistant",
          t: Date.now(),
          text: prompt,
          ask: {
            kind: "text",
            id: askId,
            placeholder,
            confirmLabel: t("ask.save"),
            skipLabel: t("ask.pass"),
            writebackToProfile: true,
          },
        },
      ],
    }));
  }

  function handleAskResolve(askId: string, value: string | null, writeback?: boolean) {
    // Pass → mark ask resolved with a "passed" pill; don't navigate.
    if (value === null) {
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.ask?.id === askId
            ? { ...m, ask: undefined, askResolvedLabel: t("ask.resolved_skipped") }
            : m,
        ),
      }));
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    const field: "name" | "city" | null = askId.startsWith("name-")
      ? "name"
      : askId.startsWith("city-")
        ? "city"
        : null;
    if (!field) return;

    if (writeback !== false) {
      const p = loadProfile();
      saveProfile({ ...p, [field]: trimmed });
    }
    const summary = field === "name"
      ? t("intro.ask_resolved_name", { name: trimmed })
      : t("intro.ask_resolved_city", { city: trimmed });
    // Remember the person so IntroCanvas can auto-resume the Say hello flow.
    const personId = askId.split("-")[1];
    try {
      window.sessionStorage.setItem("kindred:intro:resume-hello", personId);
    } catch { /* noop */ }
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.ask?.id === askId
          ? { ...m, ask: undefined, askResolvedLabel: summary }
          : m,
      ),
    }));
    // If both name+city were missing, chain: check again post-save and ask
    // for the remaining one immediately.
    const nextProfile = loadProfile();
    if (field === "name" && !nextProfile.city.trim()) {
      window.setTimeout(() => handleNeedProfile("city", personId), 60);
    }
  }

  if (!ready || !hydrated || !sessionId) return <div className="min-h-screen bg-background" />;

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
      onAskResolve={handleAskResolve}
      
      suggestions={suggestChips(state, lang)}
      rightPane={
        <IntroCanvas
          state={state}
          sessionId={sessionId}
          onPassAndNext={() => trigger(actAnotherPerson)}
          onSeeNextPerson={() => trigger(seeNextPerson)}
          onNeedProfile={handleNeedProfile}
        />
      }
    />
  );
}
