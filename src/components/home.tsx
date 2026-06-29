import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LangSwitcher } from "@/components/lang-switcher";

interface CardSpec {
  to: "/matchmaker" | "/side-by-side" | "/compass";
  nameKey: string;
  taglineKey: string;
  descKey: string;
}

const CARDS: CardSpec[] = [
  { to: "/matchmaker",   nameKey: "agents.matchmaker.name",   taglineKey: "agents.matchmaker.tagline",   descKey: "agents.matchmaker.desc" },
  { to: "/side-by-side", nameKey: "agents.sidebyside.name",   taglineKey: "agents.sidebyside.tagline",   descKey: "agents.sidebyside.desc" },
  { to: "/compass",      nameKey: "agents.compass.name",      taglineKey: "agents.compass.tagline",      descKey: "agents.compass.desc" },
];

export function Home() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="w-full">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-foreground text-background grid place-items-center font-mono text-[11px] font-bold">K</div>
            <span className="text-[14px] font-semibold tracking-tight text-foreground">Kindred</span>
          </div>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center">
          <h1 className="text-[28px] sm:text-[34px] font-serif italic leading-tight text-foreground">
            {t("home.headline")}
          </h1>
          <p className="mt-4 text-[14.5px] text-muted-foreground leading-relaxed max-w-xl mx-auto">
            {t("home.subline")}
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-3 gap-4 max-w-4xl w-full">
          {CARDS.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group rounded-xl border border-border bg-card hover:border-foreground/40 p-6 text-left transition-all hover:-translate-y-0.5"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
                {t("home.agent_label")}
              </div>
              <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-foreground">
                {t(c.nameKey)}
              </h2>
              <p className="mt-1.5 text-[13px] text-foreground/80 leading-snug">
                {t(c.taglineKey)}
              </p>
              <p className="mt-4 text-[12.5px] text-muted-foreground leading-relaxed">
                {t(c.descKey)}
              </p>
              <div className="mt-5 text-[11px] font-mono uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                {t("home.enter")} →
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-14 text-[11px] font-mono text-muted-foreground uppercase tracking-wide text-center max-w-md">
          {t("home.footer_note")}
        </p>
      </main>
    </div>
  );
}
