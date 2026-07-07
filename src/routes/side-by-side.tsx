import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { WorkspaceHeader } from "@/components/workspace-header";
import { MeetCanvas } from "@/components/canvas/meet-canvas";
import { sayHello } from "@/lib/connections";
import { consumeSeed } from "@/lib/seed";
import type { ActivityKind, Weekday } from "@/lib/types";
import {
  EMPTY,
  answerSlot,
  chooseFromFallback,
  load,
  makeOpener,
  reset,
  resolveAmbiguity,
  restart,
  save,
  start,
  submitPrompt,
  swap,
  tryNearMiss,
  type LevelTier,
  type SideState,
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

function SideBySidePage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();

  const [state, setState] = useState<SideState>(() => {
    if (typeof window === "undefined") return EMPTY;
    const seed = consumeSeed("sidebyside");
    if (seed) {
      reset();
      return start();
    }
    return load();
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    setState(start());
  }

  function handleSubmitPrompt(text: string) {
    setState((s) => submitPrompt(s, text));
  }
  function handleResolveAmbiguity(kind: ActivityKind) {
    setState((s) => resolveAmbiguity(s, kind));
  }
  function handleChooseFromFallback(kind: ActivityKind) {
    setState((s) => chooseFromFallback(s, kind));
  }
  function handleAnswerSlot(slot: "when" | "level", value: WhenTier | LevelTier | "any") {
    setState((s) => answerSlot(s, slot, value));
  }
  function handleSwap() {
    setState((s) => swap(s));
  }
  function handleRestart() {
    setState(restart());
  }
  function handleTryNearMiss(slot: { day: Weekday; window: "morning" | "midday" | "evening" }) {
    setState((s) => tryNearMiss(s, slot));
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

  return (
    <div className="h-screen flex flex-col bg-background">
      <WorkspaceHeader
        agentNameKey="agents.sidebyside.name"
        agentSubtitleKey="agents.sidebyside.tagline"
        onReset={handleReset}
      />
      <main className="flex-1 min-h-0 overflow-hidden">
        <MeetCanvas
          state={state}
          onSubmitPrompt={handleSubmitPrompt}
          onResolveAmbiguity={handleResolveAmbiguity}
          onChooseFromFallback={handleChooseFromFallback}
          onAnswerSlot={handleAnswerSlot}
          onSwap={handleSwap}
          onSayHello={handleSayHello}
          onRestart={handleRestart}
          onTryNearMiss={handleTryNearMiss}
        />
      </main>
    </div>
  );
}
