import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { avatarUrl } from "@/lib/people";
import { findResonant } from "@/lib/resonance";
import { loadSeeker } from "@/lib/store";
import { EMPTY_SEEKER, type Seeker } from "@/lib/types";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People — Muse" },
      {
        name: "description",
        content: "The people who feel closest to the one you described.",
      },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  const [seeker, setSeeker] = useState<Seeker>(() => ({ ...EMPTY_SEEKER }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSeeker(loadSeeker());
    setHydrated(true);
  }, []);

  const resonant = useMemo(() => findResonant(seeker.signals), [seeker.signals]);

  if (!hydrated) return <AppShell><div className="min-h-[40vh]" /></AppShell>;

  const hasPortrait = seeker.portrait.length > 0;

  return (
    <AppShell>
      <section className="max-w-6xl mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <p className="text-[11px] tracking-[0.32em] uppercase text-gold">
            Close to the one you described
          </p>
          <h1 className="mt-4 font-display text-5xl md:text-6xl text-foreground leading-[1.05]">
            People who feel <span className="font-display-italic text-gold">a little like them</span>.
          </h1>
          {!hasPortrait && (
            <p className="mt-5 font-display-italic text-whisper">
              You haven't described anyone yet — these are a few we keep close, in the meantime.
            </p>
          )}
        </motion.div>

        <div className="mt-10 gold-rule" />

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {resonant.map(({ person, line }, i) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 * i }}
              className="bg-background"
            >
              <Link
                to="/people/$id"
                params={{ id: person.id }}
                className="block p-7 hover:bg-card transition-colors duration-500 h-full"
              >
                <div className="flex items-start gap-5">
                  <img
                    src={avatarUrl(person.name)}
                    alt=""
                    className="w-16 h-16 border border-gold/40 bg-secondary shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-display text-2xl text-foreground">
                      {person.name}
                    </div>
                    <div className="text-[11px] tracking-[0.18em] uppercase text-whisper mt-1">
                      {person.age} · {person.city}
                    </div>
                  </div>
                </div>
                <p className="mt-6 font-display-italic text-lg text-gold-soft leading-snug">
                  "{line}"
                </p>
                <p className="mt-4 text-sm text-whisper leading-relaxed line-clamp-3">
                  {person.portrait}
                </p>
                <div className="mt-6 text-[10px] tracking-[0.28em] uppercase text-gold opacity-70 group-hover:opacity-100">
                  Read more →
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {!hasPortrait && (
          <div className="mt-16 text-center">
            <Link
              to="/describe"
              className="inline-flex border border-gold/70 px-7 py-3 text-[11px] tracking-[0.22em] uppercase text-gold hover:bg-gold hover:text-primary-foreground transition-colors"
            >
              Describe someone
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
