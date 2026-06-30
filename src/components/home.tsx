import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUp, MessageCircle, UserSearch, Users } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";
import { routeIntent } from "@/lib/route-intent";
import { setSeed, type AgentId } from "@/lib/seed";
import { hasUnseen, list, rehydrate, subscribe } from "@/lib/connections";

interface Chip {
  id: AgentId;
  to: "/matchmaker" | "/side-by-side";
  labelKey: string;
  nameKey: string;
  Icon: typeof UserSearch;
}

const CHIPS: Chip[] = [
  { id: "matchmaker", to: "/matchmaker",   labelKey: "home.chip.intro",    nameKey: "agents.matchmaker.name", Icon: UserSearch },
  { id: "sidebyside", to: "/side-by-side", labelKey: "home.chip.together", nameKey: "agents.sidebyside.name", Icon: Users },
];

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted) taRef.current?.focus(); }, [mounted]);

  function submit() {
    const body = text.trim();
    if (!body) return;
    const target: AgentId = selected ?? routeIntent(body);
    setSeed(target, body);
    const to = target === "matchmaker" ? "/matchmaker" : "/side-by-side";
    void navigate({ to });
  }

  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" suppressHydrationWarning>
      <header className="w-full">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-foreground text-background grid place-items-center font-mono text-[11px] font-bold">K</div>
            <span className="text-[14px] font-semibold tracking-tight text-foreground">Kindred</span>
          </div>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="w-full max-w-2xl">
          <h1
            className="text-center text-[26px] sm:text-[32px] font-serif italic leading-tight text-foreground"
            suppressHydrationWarning
          >
            {t("home.greeting")}
          </h1>

          {/* Composer */}
          <div className="mt-10 rounded-2xl border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_30px_-18px_rgba(0,0,0,0.18)] focus-within:border-foreground/40 transition-colors">
            <div className="px-5 pt-4 pb-2">
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => { setText(e.target.value); autosize(e.target); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                rows={2}
                placeholder={mounted ? t("home.placeholder") : ""}
                className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70"
                suppressHydrationWarning
              />
            </div>

            <div className="px-3 pb-3 pt-1 flex items-center justify-between gap-2">
              {/* Agent chips */}
              <div className="flex flex-wrap items-center gap-1.5 pl-2">
                {CHIPS.map((c) => {
                  const active = selected === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(active ? null : c.id)}
                      className={[
                        "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-foreground/80 hover:border-foreground/50 hover:text-foreground",
                      ].join(" ")}
                      aria-pressed={active}
                      suppressHydrationWarning
                    >
                      <c.Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span suppressHydrationWarning>{t(c.labelKey)}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={!text.trim()}
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-foreground text-background disabled:opacity-25 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                aria-label={t("home.send")}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {/* Footnote */}
          <p
            className="mt-6 text-center text-[11.5px] text-muted-foreground font-mono uppercase tracking-[0.12em]"
            suppressHydrationWarning
          >
            {t("home.agents_footnote")}
          </p>
        </div>
      </main>
    </div>
  );
}
