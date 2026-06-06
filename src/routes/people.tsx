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
      { title: "People — Bloom" },
      {
        name: "description",
        content: "People Scout found who resonate with your portrait.",
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
      <section className="max-w-6xl mx-auto px-5 md:px-6 py-10 md:py-14">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Found by Scout
          </div>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            People who resonate
          </h1>
          {!hasPortrait && (
            <p className="mt-2 text-sm text-muted-foreground">
              You haven't described anyone yet — these are a few we keep close, in the meantime.
            </p>
          )}
        </motion.div>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resonant.map(({ person, line }, i) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.04 * i }}
            >
              <Link
                to="/people/$id"
                params={{ id: person.id }}
                className="block h-full rounded-xl bg-card border border-border p-5 shadow-soft hover:border-foreground/20 hover:shadow-pop transition-all duration-200"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={avatarUrl(person.name)}
                    alt=""
                    className="w-12 h-12 rounded-md border border-border bg-secondary shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground tracking-tight">
                      {person.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {person.age} · {person.city} · {person.occupation}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-foreground leading-snug border-l-2 border-foreground pl-3">
                  {line}
                </p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {person.portrait}
                </p>
                <div className="mt-4 text-xs text-foreground font-medium">
                  Read more →
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {!hasPortrait && (
          <div className="mt-12 text-center">
            <Link
              to="/"
              className="inline-flex px-5 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
            >
              Describe someone
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
