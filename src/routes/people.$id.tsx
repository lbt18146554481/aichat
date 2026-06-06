import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { avatarUrl, getPersonById } from "@/lib/people";
import { findResonant } from "@/lib/resonance";
import { loadSeeker } from "@/lib/store";

export const Route = createFileRoute("/people/$id")({
  loader: ({ params }) => {
    const person = getPersonById(params.id);
    if (!person) throw notFound();
    return { person };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.person.name} — Muse` : "Muse" },
      {
        name: "description",
        content: loaderData?.person.portrait ?? "A person on Muse.",
      },
    ],
  }),
  notFoundComponent: () => (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-foreground">Not found.</h1>
        <p className="mt-2 text-whisper">This person isn't here.</p>
        <Link
          to="/people"
          className="mt-8 inline-flex border border-gold/70 px-6 py-2.5 text-[11px] tracking-[0.22em] uppercase text-gold hover:bg-gold hover:text-primary-foreground transition-colors"
        >
          Back to people
        </Link>
      </div>
    </AppShell>
  ),
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-foreground">Something went quiet.</h1>
        <p className="mt-2 text-whisper text-sm">{error.message}</p>
        <button
          onClick={reset}
          className="mt-8 border border-gold/70 px-6 py-2.5 text-[11px] tracking-[0.22em] uppercase text-gold"
        >
          Try again
        </button>
      </div>
    </AppShell>
  ),
  component: PersonPage,
});

function PersonPage() {
  const { person } = Route.useLoaderData();
  const [resonance, setResonance] = useState<{ shared: string[]; line: string } | null>(null);

  useEffect(() => {
    const seeker = loadSeeker();
    if (seeker.signals.length === 0) return;
    const hit = findResonant(seeker.signals).find((r) => r.person.id === person.id);
    if (hit) setResonance({ shared: hit.shared, line: hit.line });
  }, [person.id]);

  return (
    <AppShell>
      <section className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/people"
          className="text-[11px] tracking-[0.22em] uppercase text-whisper hover:text-foreground"
        >
          ← People
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mt-10 flex flex-col md:flex-row gap-8 items-start"
        >
          <img
            src={avatarUrl(person.name)}
            alt=""
            className="w-32 h-32 border border-gold/50 bg-secondary shrink-0"
          />
          <div>
            <p className="text-[11px] tracking-[0.32em] uppercase text-gold">
              {person.occupation}
            </p>
            <h1 className="mt-3 font-display text-6xl text-foreground leading-none">
              {person.name}
            </h1>
            <p className="mt-3 text-[12px] tracking-[0.22em] uppercase text-whisper">
              {person.age} · {person.city}
            </p>
          </div>
        </motion.div>

        <div className="mt-12 gold-rule" />

        {resonance && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="mt-10"
          >
            <p className="text-[10px] tracking-[0.32em] uppercase text-gold mb-3">
              Why we thought of {person.name.split(" ")[0]}
            </p>
            <p className="font-display-italic text-2xl text-gold-soft leading-snug">
              "{resonance.line}"
            </p>
          </motion.div>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.3 }}
          className="mt-10 font-display text-2xl md:text-3xl text-foreground leading-[1.5]"
        >
          {person.portrait}
        </motion.p>

        <div className="mt-12">
          <div className="text-[10px] tracking-[0.32em] uppercase text-whisper mb-4">
            They notice
          </div>
          <div className="flex flex-wrap gap-2">
            {person.signals.map((s: string) => (
              <span
                key={s}
                className="border border-border text-whisper text-[11px] tracking-[0.18em] uppercase px-3 py-1"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-wrap gap-3 items-center justify-between">
          <Link
            to="/people"
            className="border border-border px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase text-whisper hover:text-foreground"
          >
            ← All people
          </Link>
          <button
            onClick={() =>
              toast("A quiet hello is on its way.", {
                description: "Direct messages are coming soon.",
              })
            }
            className="border border-gold/70 bg-gold text-primary-foreground px-6 py-2.5 text-[11px] tracking-[0.22em] uppercase hover:bg-gold-soft transition-colors"
          >
            Reach out
          </button>
        </div>
      </section>
    </AppShell>
  );
}
