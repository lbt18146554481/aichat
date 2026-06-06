import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { composePortrait } from "@/lib/portrait";
import { loadSeeker, saveSeeker } from "@/lib/store";
import { EMPTY_SEEKER, type Seeker } from "@/lib/types";

export const Route = createFileRoute("/portrait")({
  head: () => ({
    meta: [
      { title: "Portrait — Muse" },
      {
        name: "description",
        content: "The portrait Muse gathered from your words.",
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
      <section className="max-w-3xl mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <p className="text-[11px] tracking-[0.32em] uppercase text-gold">
            Your portrait
          </p>
          <h1 className="mt-4 font-display text-5xl md:text-6xl text-foreground leading-[1.05]">
            The shape of <span className="font-display-italic text-gold">them</span>.
          </h1>
        </motion.div>

        <div className="mt-12 gold-rule" />

        {!hasPortrait ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-12 text-center"
          >
            <p className="font-display-italic text-2xl text-whisper">
              No portrait yet.
            </p>
            <p className="mt-3 text-sm text-whisper">
              Begin with a conversation. A few quiet words is enough.
            </p>
            <Link
              to="/describe"
              className="mt-8 inline-flex border border-gold/70 px-6 py-3 text-[11px] tracking-[0.22em] uppercase text-gold hover:bg-gold hover:text-primary-foreground transition-colors"
            >
              Begin
            </Link>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="mt-12"
            >
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full bg-transparent border border-border focus:border-gold/60 px-5 py-4 font-display text-xl md:text-2xl text-foreground outline-none leading-relaxed"
                />
              ) : (
                <p className="font-display text-2xl md:text-3xl text-foreground leading-[1.45] whitespace-pre-wrap">
                  {seeker.portrait}
                </p>
              )}
            </motion.div>

            {seeker.signals.length > 0 && (
              <div className="mt-12">
                <div className="text-[10px] tracking-[0.32em] uppercase text-whisper mb-4">
                  Signals
                </div>
                <div className="flex flex-wrap gap-2">
                  {seeker.signals.map((s) => (
                    <span
                      key={s}
                      className="border border-gold/40 text-gold-soft text-[11px] tracking-[0.18em] uppercase px-3 py-1"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-14 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-3">
                {editing ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="border border-gold/70 bg-gold text-primary-foreground px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setDraft(seeker.portrait);
                        setEditing(false);
                      }}
                      className="border border-border px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase text-whisper"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="border border-border px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase text-whisper hover:text-foreground"
                    >
                      Refine
                    </button>
                    <button
                      onClick={handleRegenerate}
                      className="border border-border px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase text-whisper hover:text-foreground"
                    >
                      Regenerate
                    </button>
                  </>
                )}
              </div>
              <Link
                to="/people"
                className="border border-gold/70 px-6 py-2.5 text-[11px] tracking-[0.22em] uppercase text-gold hover:bg-gold hover:text-primary-foreground transition-colors"
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
