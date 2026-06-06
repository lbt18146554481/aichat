import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Flower2 } from "lucide-react";
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
      { title: loaderData ? `${loaderData.person.name} — Bloom` : "Bloom" },
      {
        name: "description",
        content: loaderData?.person.portrait ?? "A person on Bloom.",
      },
    ],
  }),
  notFoundComponent: () => (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-foreground">Not found.</h1>
        <p className="mt-2 text-muted-foreground">This person isn't here.</p>
        <Link
          to="/people"
          className="mt-8 inline-flex px-6 py-2.5 rounded-full gradient-coral text-white text-sm font-medium shadow-petal"
        >
          Back to people
        </Link>
      </div>
    </AppShell>
  ),
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-foreground">Something didn't bloom.</h1>
        <p className="mt-2 text-muted-foreground text-sm">{error.message}</p>
        <button
          onClick={reset}
          className="mt-8 px-6 py-2.5 rounded-full gradient-coral text-white text-sm font-medium shadow-petal"
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
      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <Link
          to="/people"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← People
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mt-8 rounded-3xl bg-card/85 backdrop-blur border border-border p-7 md:p-10 shadow-petal"
        >
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <img
              src={avatarUrl(person.name)}
              alt=""
              className="w-28 h-28 rounded-full border-4 border-secondary bg-secondary shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/40 text-accent-foreground text-xs font-medium">
                {person.occupation}
              </div>
              <h1 className="mt-3 font-display text-5xl md:text-6xl text-foreground leading-none">
                {person.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {person.age} · {person.city}
              </p>
            </div>
          </div>

          {resonance && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="mt-8 p-5 rounded-2xl bg-secondary/60 border border-secondary"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-secondary-foreground/80 mb-2 flex items-center gap-1.5">
                <Flower2 className="w-3.5 h-3.5 text-primary" />
                Why we thought of {person.name.split(" ")[0]}
              </div>
              <p className="font-display italic text-xl text-primary leading-snug">
                "{resonance.line}"
              </p>
            </motion.div>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-8 font-display text-2xl md:text-3xl text-foreground leading-[1.45]"
          >
            {person.portrait}
          </motion.p>

          <div className="mt-8">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
              They notice
            </div>
            <div className="flex flex-wrap gap-2">
              {person.signals.map((s: string) => (
                <span
                  key={s}
                  className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="mt-8 flex flex-wrap gap-3 items-center justify-between">
          <Link
            to="/people"
            className="px-5 py-2.5 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-muted"
          >
            ← All people
          </Link>
          <button
            onClick={() =>
              toast("A quiet hello is on its way 🌷", {
                description: "Direct messages are coming soon.",
              })
            }
            className="px-6 py-2.5 rounded-full gradient-coral text-white text-sm font-medium shadow-petal hover:scale-105 transition-transform"
          >
            Say hi
          </button>
        </div>
      </section>
    </AppShell>
  );
}
