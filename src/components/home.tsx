import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUp, MessageCircle, UserSearch, Users, UserCircle } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";

import { HistoryTrigger } from "@/components/history-trigger";
import { SavedTrigger } from "@/components/saved-trigger";
import { AccountMenu } from "@/components/account-menu";
import { routeIntent } from "@/lib/route-intent";
import { setSeed, type AgentId } from "@/lib/seed";
import { hasUnseen, list, rehydrate, subscribe } from "@/lib/connections";
import { createSession } from "@/lib/sessions";
import { useAuth } from "@/lib/auth";
import { EMPTY as EMPTY_SIDE } from "@/lib/agents/side-by-side";
import { EMPTY as EMPTY_MATCHMAKER } from "@/lib/agents/matchmaker";



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
  const { user } = useAuth();

  const navigate = useNavigate();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [mounted, setMounted] = useState(false);
  const [connCount, setConnCount] = useState(0);
  const [unseen, setUnseen] = useState(false);



  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    // Autofocus is desktop-only. On mobile, auto-focusing the textarea
    // would summon the keyboard immediately and hide the greeting.
    if (!mounted) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      taRef.current?.focus();
    }
  }, [mounted]);
  useEffect(() => {
    rehydrate();
    const update = () => { setConnCount(list().length); setUnseen(hasUnseen()); };
    update();
    const unsub = subscribe(update);
    return () => { unsub(); };
  }, []);

  function submit() {
    const body = text.trim();
    if (!body) return;
    if (!user) {
      void navigate({ to: "/auth", search: { mode: "signin", redirect: "/" } });
      return;
    }
    const target: AgentId = selected ?? routeIntent(body);
    setSeed(target, body);
    // Every submit — regardless of which Agent it routes to — creates one
    // History row. New chat semantics: home = new conversation, always.
    if (target === "sidebyside") {
      const s = createSession("do_something", body, EMPTY_SIDE);
      void navigate({ to: "/side-by-side", search: { session: s.id } });
      return;
    }
    const s = createSession("introduce", body, EMPTY_MATCHMAKER);
    void navigate({ to: "/matchmaker", search: { session: s.id } });
  }


  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col pb-tabbar" suppressHydrationWarning>
      {/* Desktop header — hidden on mobile in favor of the bottom tab bar. */}
      <header className="hidden md:block w-full border-b border-border/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-primary text-primary-foreground grid place-items-center font-mono text-[11px] font-bold">K</div>
            <span className="text-[14px] font-semibold tracking-tight text-foreground">Kindred</span>
          </div>
          <div className="flex items-center gap-3">
            {mounted && <SavedTrigger />}
            {mounted && <HistoryTrigger />}
            {connCount > 0 && (
              <Link
                to="/connections"
                className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span suppressHydrationWarning>{mounted ? t("home.connections") : ""}</span>
                {unseen && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
              </Link>
            )}
            <LangSwitcher />
            {mounted && <AccountMenu />}
          </div>
        </div>
      </header>

      {/* Mobile top strip */}
      <div className="md:hidden pt-safe">
        <div className="px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary text-primary-foreground grid place-items-center font-mono text-[11px] font-bold">K</div>
            <span className="text-[13.5px] font-semibold tracking-tight text-foreground">Kindred</span>
          </div>

          <div className="flex items-center gap-1">
            {mounted && <SavedTrigger variant="compact" />}
            <LangSwitcher />
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col md:block px-5 md:px-6">
        <div className="w-full max-w-3xl md:mx-auto flex-1 flex flex-col md:block md:pt-[16vh]">
          <div className="flex-1 md:flex-none flex items-center md:block pt-6 md:pt-0">
            <h1
              className="w-full text-center md:text-left text-[28px] sm:text-[36px] md:text-[44px] font-semibold tracking-[-0.02em] leading-[1.15] text-foreground"
              suppressHydrationWarning
            >
              {t("home.greeting")}
            </h1>
          </div>

          {/* Composer */}
          <div className="md:mt-8 sticky bottom-0 md:static z-10 bg-background md:bg-transparent -mx-5 md:mx-0 px-5 md:px-0 pb-[max(env(safe-area-inset-bottom),12px)] md:pb-0 pt-3 md:pt-0">
            {/* Suggestion chips — above composer on desktop, Gemini-style */}
            <div className="hidden md:flex flex-wrap items-center gap-2 mb-3">
              {CHIPS.map((c) => {
                const active = selected === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(active ? null : c.id)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                      active
                        ? "border-foreground/25 bg-surface text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20",
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

            <div className="rounded-3xl border border-border bg-card shadow-sm-soft focus-within:border-foreground/30 transition-colors">
              <div className="px-4 md:px-5 pt-3 md:pt-4 pb-2">
                <textarea
                  ref={taRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); autosize(e.target); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                  }}
                  rows={2}
                  placeholder={mounted ? t("home.placeholder") : ""}
                  className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed text-foreground placeholder:text-subtle-foreground"
                  suppressHydrationWarning
                />
              </div>

              <div className="px-2.5 md:px-3 pb-2.5 md:pb-3 pt-1 flex items-center justify-between gap-2">
                {/* Mobile-only chip row inside composer to keep thumb reach */}
                <div className="flex md:hidden flex-wrap items-center gap-1.5 pl-1.5">
                  {CHIPS.map((c) => {
                    const active = selected === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelected(active ? null : c.id)}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] transition-colors min-h-[36px]",
                          active
                            ? "border-foreground/25 bg-surface text-foreground"
                            : "border-border bg-card text-muted-foreground",
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
                <div className="hidden md:block flex-1" />

                <button
                  type="button"
                  onClick={submit}
                  disabled={!text.trim()}
                  className="shrink-0 inline-flex items-center justify-center w-10 h-10 md:w-9 md:h-9 rounded-full bg-foreground text-background disabled:bg-input disabled:text-subtle-foreground disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  aria-label={t("home.send")}
                  suppressHydrationWarning
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>

            <p
              className="mt-3 md:mt-4 text-center text-[10.5px] md:text-[11px] text-subtle-foreground font-mono uppercase tracking-[0.12em]"
              suppressHydrationWarning
            >
              {t("home.agents_footnote")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
