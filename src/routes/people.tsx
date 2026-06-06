import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Flower2 } from "lucide-react";
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
        content: "People who feel a little like the one you described.",
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
      <section className="max-w-6xl mx-auto px-5 md:px-6 py-12 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
            <Flower2 className="w-3.5 h-3.5 text-primary" /> People you might bloom with
          </div>
          <h1 className="mt-5 font-display text-5xl md:text-6xl text-foreground leading-[1.05]">
            People who feel{" "}
            <span className="font-display-italic text-gradient-bloom">
              a little like them
            </span>
            .
          </h1>
          {!hasPortrait && (
            <p className="mt-4 italic text-muted-foreground">
              You haven't described anyone yet — these are a few we keep close, in the meantime.
            </p>
          )}
        </motion.div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {resonant.map(({ person, line }, i) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 * i }}
            >
              <Link
                to="/people/$id"
                params={{ id: person.id }}
                className="block h-full rounded-3xl bg-card/85 backdrop-blur border border-border p-6 shadow-petal hover:shadow-bloom hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <img
                    src={avatarUrl(person.name)}
                    alt=""
                    className="w-16 h-16 rounded-full border-2 border-secondary bg-secondary shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-display text-2xl text-foreground">
                      {person.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {person.age} · {person.city} · {person.occupation}
                    </div>
                  </div>
                </div>
                <p className="mt-5 font-display italic text-lg text-primary leading-snug">
                  "{line}"
                </p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {person.portrait}
                </p>
                <div className="mt-5 text-xs text-primary font-medium">
                  Read more →
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {!hasPortrait && (
          <div className="mt-14 text-center">
            <Link
              to="/"
              className="inline-flex px-7 py-3 rounded-full gradient-coral text-white text-sm font-medium shadow-petal hover:scale-105 transition-transform"
            >
              Describe someone
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
