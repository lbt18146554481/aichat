import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { WorkspaceHeader } from "@/components/workspace-header";
import { MeetCanvas, EditForm } from "@/components/canvas/meet-canvas";
import { sayHello } from "@/lib/connections";
import { consumeSeed } from "@/lib/seed";
import {
  EMPTY,
  addSlot,
  load,
  makeOpener,
  reset,
  save,
  setUserActivity,
  start,
  swap,
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
  const navigate = useNavigate();

  const [state, setState] = useState<SideState>(() => {
    if (typeof window === "undefined") return EMPTY;
    const seed = consumeSeed("sidebyside");
    if (seed) {
      // Seeding just brings the user to the form; we don't parse the intent
      // — the two-choice form does that for them.
      reset();
      return start();
    }
    const loaded = load();
    return loaded;
  });
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  function handleReset() {
    if (!confirm("Start over?")) return;
    reset();
    setState(start());
    setEditing(false);
  }

  function handleSetActivity(a: UserActivity) {
    setState((s) => setUserActivity(s, a));
    setEditing(false);
  }

  function handleSwap() {
    setState((s) => swap(s));
  }

  function handleAddSlot(slot: Parameters<typeof addSlot>[1]) {
    setState((s) => addSlot(s, slot));
  }

  function handleSayHello() {
    setState((current) => {
      if (!current.candidate || !current.user) return current;
      const opener = makeOpener(current.candidate, current.user, lang);
      sayHello(current.candidate.personId, { quotedMomentId: null, reply: opener });
      // After say hello: park in a clean state so a re-entry is fresh.
      const next: SideState = {
        ...current,
        candidate: null,
        skipped: [...current.skipped, current.candidate.personId],
      };
      // Navigate on next tick so state save can flush.
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
        {editing && state.user ? (
          <EditForm
            initial={state.user}
            onSubmit={(a) => handleSetActivity(a)}
          />
        ) : (
          <MeetCanvas
            state={state}
            onSetActivity={handleSetActivity}
            onSwap={handleSwap}
            onAddSlot={handleAddSlot}
            onSayHello={handleSayHello}
            onEdit={() => setEditing(true)}
          />
        )}
      </main>
    </div>
  );
}
