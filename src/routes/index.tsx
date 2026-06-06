import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Muse — Describe the one you're looking for" },
      {
        name: "description",
        content:
          "A quiet way to find someone real. Describe the person you imagine; we'll help you find them.",
      },
      { property: "og:title", content: "Muse" },
      {
        property: "og:description",
        content: "Describe the one you're looking for. We'll help you find them.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <AppShell>
      <section className="max-w-3xl mx-auto px-6 pt-24 md:pt-36 pb-24 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="text-[11px] tracking-[0.32em] uppercase text-gold"
        >
          A quieter way to be found
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
          className="mt-8 font-display text-5xl md:text-7xl leading-[1.05] text-foreground"
        >
          Describe the one
          <br />
          you're <span className="font-display-italic text-gold">looking for</span>.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mt-8 text-base md:text-lg text-whisper leading-relaxed max-w-xl mx-auto"
        >
          Not a checklist. Not a swipe. Just a quiet conversation
          about the shape of the person you imagine — and the people
          who already feel a little like them.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.85 }}
          className="mt-14"
        >
          <Link
            to="/describe"
            className="inline-flex items-center gap-3 border border-gold/70 px-8 py-3.5 text-[12px] tracking-[0.28em] uppercase text-gold hover:bg-gold hover:text-primary-foreground transition-colors duration-500"
          >
            Begin <span className="caret-blink" />
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mt-32 grid md:grid-cols-3 gap-10 text-left"
        >
          {[
            { n: "I.", t: "Describe", d: "Tell us, in your own words, the person you hope to meet." },
            { n: "II.", t: "Refine", d: "Muse asks a few quiet questions and gathers your description into a portrait." },
            { n: "III.", t: "Find", d: "Meet the people who feel closest to the one you imagined." },
          ].map((s, i) => (
            <motion.div
              key={s.t}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.3 + i * 0.12 }}
            >
              <div className="font-display-italic text-gold text-xl">{s.n}</div>
              <div className="mt-2 font-display text-2xl text-foreground">{s.t}</div>
              <p className="mt-2 text-sm text-whisper leading-relaxed">{s.d}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AppShell>
  );
}
