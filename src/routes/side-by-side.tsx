import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Workspace, type AgentMsg } from "@/components/workspace";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { consumeSeed } from "@/lib/seed";
import {
  EMPTY,
  accept,
  decline,
  load,
  reset,
  save,
  setUserActivity,
  simulateThemReply,
  start,
  uid,
  type SideState,
  type UserActivity,
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

function SideBySidePage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  const [state, setState] = useState<SideState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    const seed = consumeSeed("sidebyside");
    if (seed) {
      reset();
      const base = start(lang);
      const ackEn = "Got it. Side by Side works around something you actually do every week. Pick your activity on the right and I'll start watching for a real overlap.";
      const ackZh = "明白。Side by Side 围绕你每周本来就在做的事来安排。先在右边告诉我你常做什么，我就开始留意真正能对上的人。";
      const now = Date.now();
      setState({
        ...base,
        messages: [
          ...base.messages,
          { id: uid(), role: "user", t: now, text: seed },
          { id: uid(), role: "assistant", t: now + 1, text: lang === "zh-CN" ? ackZh : ackEn },
        ],
      });
    } else {
      const loaded = load();
      setState(loaded.messages.length === 0 ? start(lang) : loaded);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    setState(start(lang));
  }

  // The composer is mostly informational here — Side by Side is driven by
  // the form on the right. But we still allow a free-text reply that just
  // gets echoed and noted.
  function send(_text: string) {
    setThinking(true);
    window.setTimeout(() => setThinking(false), 300);
  }

  function handleSetActivity(a: UserActivity) {
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => setUserActivity(s, a, lang));
      setThinking(false);
    }, 600);
  }

  function handleAccept() {
    setState((s) => accept(s, lang));
  }
  function handleDecline() {
    setState((s) => decline(s, lang));
  }
  function handleTheirReply(accepted: boolean) {
    setState((s) => simulateThemReply(s, accepted, lang));
  }

  if (!hydrated) return <div className="h-screen bg-background" />;

  const messages: AgentMsg[] = state.messages;
  const composerDisabled = state.phase !== "waiting" && state.phase !== "gathering";

  return (
    <Workspace
      agentNameKey="agents.sidebyside.name"
      agentSubtitleKey="agents.sidebyside.tagline"
      placeholderKey="meet.composer_placeholder"
      messages={messages}
      thinking={thinking}
      onSend={send}
      onReset={handleReset}
      composerDisabled={composerDisabled}
      rightPane={
        <MeetCanvas
          state={state}
          onSetActivity={handleSetActivity}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onTheirReply={handleTheirReply}
        />
      }
    />
  );
}
