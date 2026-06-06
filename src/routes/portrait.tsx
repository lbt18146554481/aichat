import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
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
        content: "The portrait Portrait gathered from your words.",
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
      <section className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Drafted by Portrait
          </div>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Your portrait
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A short prose sketch of the person you described.
          </p>
        </motion.div>

        {!hasPortrait ? (
          <div className="mt-10 rounded-xl bg-card border border-border p-8 text-center shadow-soft">
            <p className="text-base text-foreground">No portrait yet.</p>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Start a conversation on the home page. A few quiet words is enough.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
            >
              Start chatting
            </Link>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-8 rounded-xl bg-card border border-border p-6 md:p-8 shadow-soft"
            >
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full bg-secondary rounded-md px-4 py-3 text-base text-foreground outline-none focus:ring-2 focus:ring-foreground/15 leading-relaxed border border-border"
                />
              ) : (
                <p className="text-lg md:text-xl text-foreground leading-[1.6] whitespace-pre-wrap">
                  {seeker.portrait}
                </p>
              )}
            </motion.div>

            {seeker.signals.length > 0 && (
              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
                  Signals
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {seeker.signals.map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 rounded-md bg-secondary text-foreground text-xs font-medium border border-border"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-10 flex flex-wrap gap-2 items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setDraft(seeker.portrait);
                        setEditing(false);
                      }}
                      className="px-4 py-2 rounded-md bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="px-4 py-2 rounded-md bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      Refine
                    </button>
                    <button
                      onClick={handleRegenerate}
                      className="px-4 py-2 rounded-md bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  </>
                )}
              </div>
              <Link
                to="/people"
                className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
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
