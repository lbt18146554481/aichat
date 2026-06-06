import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Flower2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { composePortrait } from "@/lib/portrait";
import { loadSeeker, saveSeeker } from "@/lib/store";
import { EMPTY_SEEKER, type Seeker } from "@/lib/types";

export const Route = createFileRoute("/portrait")({
  head: () => ({
    meta: [
      { title: "Your portrait — Bloom" },
      {
        name: "description",
        content: "The portrait Bloom gathered from your words.",
      },
    ],
  }),
  component: PortraitPage,
});

function PortraitPage() {
  const [seeker, setSeeker] = useState<Seeker>(() => ({ ...EMPTY_SEEKER }));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = loadSeeker();
    setSeeker(s);
    setDraft(s.portrait);
    setHydrated(true);
  }, []);

  if (!hydrated) return <AppShell><div className="min-h-[40vh]" /></AppShell>;

  const hasPortrait = seeker.portrait.length > 0;

  function handleSave() {
    const next = { ...seeker, portrait: draft.trim() };
    setSeeker(next);
    saveSeeker(next);
    setEditing(false);
  }

  function handleRegenerate() {
    const fresh = composePortrait(seeker);
    setDraft(fresh);
    const next = { ...seeker, portrait: fresh };
    setSeeker(next);
    saveSeeker(next);
  }

  return (
    <AppShell>
      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
            <Flower2 className="w-3.5 h-3.5 text-primary" /> Your portrait
          </div>
          <h1 className="mt-5 font-display text-5xl md:text-6xl text-foreground leading-[1.05]">
            The shape of{" "}
            <span className="font-display-italic text-gradient-bloom">them</span>.
          </h1>
        </motion.div>

        {!hasPortrait ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-14 rounded-3xl bg-card/80 backdrop-blur border border-border p-10 text-center shadow-petal"
          >
            <p className="font-display italic text-2xl text-muted-foreground">
              No portrait yet.
            </p>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Start a conversation on the home page. A few quiet words is enough.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex px-6 py-3 rounded-full gradient-coral text-white text-sm font-medium shadow-petal hover:scale-105 transition-transform"
            >
              Start chatting
            </Link>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="mt-10 rounded-3xl bg-card/85 backdrop-blur border border-border p-7 md:p-10 shadow-petal"
            >
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full bg-muted/60 rounded-2xl px-5 py-4 font-display text-xl md:text-2xl text-foreground outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed"
                />
              ) : (
                <p className="font-display text-2xl md:text-3xl text-foreground leading-[1.5] whitespace-pre-wrap">
                  {seeker.portrait}
                </p>
              )}
            </motion.div>

            {seeker.signals.length > 0 && (
              <div className="mt-8">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  Signals
                </div>
                <div className="flex flex-wrap gap-2">
                  {seeker.signals.map((s) => (
                    <span
                      key={s}
                      className="px-3 py-1 rounded-full bg-accent/40 text-accent-foreground text-xs font-medium"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="px-5 py-2.5 rounded-full gradient-coral text-white text-sm font-medium shadow-petal"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setDraft(seeker.portrait);
                        setEditing(false);
                      }}
                      className="px-5 py-2.5 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="px-5 py-2.5 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Refine
                    </button>
                    <button
                      onClick={handleRegenerate}
                      className="px-5 py-2.5 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  </>
                )}
              </div>
              <Link
                to="/people"
                className="px-6 py-2.5 rounded-full gradient-coral text-white text-sm font-medium shadow-petal"
              >
                Meet them →
              </Link>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
