import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUp, UserSearch, Users } from "lucide-react";
import type { AgentId } from "@/lib/seed";
import { AppChromeHeader } from "@/components/app-chrome-header";
import { useAuth } from "@/lib/auth";
import { normalizeLang } from "@/lib/lang";
import { requestOrchestratorTurn } from "@/lib/orchestrator-client";
import type { OrchestratorOutput } from "@/lib/orchestrator-llm.server";
import type { HandoffContext, GraftedMessage } from "@/lib/handoff";
import { openMatchmakerFromHandoff, openSideBySideFromHandoff } from "@/lib/session-handoff";
import type { UserUnderstanding } from "@/lib/understanding";
import {
  clearActiveThreadId,
  getActiveThreadId,
  setActiveThreadId,
} from "@/lib/active-thread";
import { seedForNewSession } from "@/lib/thread-title-milestone";
import { deriveThreadTitle } from "@/lib/thread-title";
import {
  createSession,
  getLatestSessionInThread,
  updateSession,
  type ReceptionState,
} from "@/lib/sessions";
import { useSessions } from "@/data/hooks";

interface ReceptionMsg {
  role: "user" | "assistant";
  content: string;
}

const AGENT_CHIPS: {
  id: AgentId;
  labelKey: string;
  promptKey: string;
  Icon: typeof UserSearch;
}[] = [
  {
    id: "matchmaker",
    labelKey: "home.chip.intro",
    promptKey: "home.chip_prompt_matchmaker",
    Icon: UserSearch,
  },
  {
    id: "sidebyside",
    labelKey: "home.chip.together",
    promptKey: "home.chip_prompt_sidebyside",
    Icon: Users,
  },
];

export function Home() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const { user } = useAuth();
  const search = useSearch({ strict: false });
  const threadParam = typeof search.thread === "string" ? search.thread : undefined;

  const navigate = useNavigate();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const persistSkip = useRef(true);

  const [text, setText] = useState("");
  const [mounted, setMounted] = useState(false);
  const [threadReady, setThreadReady] = useState(false);
  const [receptionSessionId, setReceptionSessionId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [reception, setReception] = useState<ReceptionMsg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [lastUnderstanding, setLastUnderstanding] = useState<UserUnderstanding | undefined>();
  const { isFetched: sessionsReady } = useSessions();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setReceptionSessionId(null);
      setReception([]);
      setThreadReady(true);
      return;
    }
    if (!sessionsReady) {
      setThreadReady(false);
      return;
    }
    let skipResume = false;
    try {
      if (window.sessionStorage.getItem("kindred:home:focus") === "1") {
        skipResume = true;
      }
    } catch {
      /* noop */
    }

    const threadId = threadParam || (skipResume ? null : getActiveThreadId());
    if (!threadId) {
      setReceptionSessionId(null);
      setReception([]);
      persistSkip.current = true;
      setThreadReady(true);
      return;
    }

    const latest = getLatestSessionInThread(threadId);
    if (!latest) {
      if (!threadParam) clearActiveThreadId();
      setReceptionSessionId(null);
      setReception([]);
      persistSkip.current = true;
      setThreadReady(true);
      return;
    }

    setActiveThreadId(threadId);

    if (latest.agent === "introduce") {
      void navigate({ to: "/matchmaker", search: { session: latest.id }, replace: !threadParam });
      return;
    }
    if (latest.agent === "do_something") {
      void navigate({
        to: "/side-by-side",
        search: { session: latest.id, chatWith: "" },
        replace: !threadParam,
      });
      return;
    }

    const st = latest.state as ReceptionState;
    setReceptionSessionId(latest.id);
    setReception(Array.isArray(st.messages) ? st.messages : []);
    persistSkip.current = true;
    if (!threadParam) {
      void navigate({ to: "/", search: { thread: threadId } as Record<string, string>, replace: true });
    }
    setThreadReady(true);
  }, [user, sessionsReady, threadParam, navigate]);

  useEffect(() => {
    if (!user || !receptionSessionId || !threadReady) return;
    if (persistSkip.current) {
      persistSkip.current = false;
      return;
    }
    if (reception.length === 0) return;
    const userMessages = reception.filter((m) => m.role === "user").map((m) => m.content);
    const seed = deriveThreadTitle({ userMessages }) || seedForNewSession({ userMessages });
    updateSession(receptionSessionId, {
      state: { messages: reception } satisfies ReceptionState,
      seed,
      status: "waiting",
    });
  }, [reception, receptionSessionId, user, threadReady]);

  useEffect(() => {
    setReception([]);
    setSuggestions([]);
    setLastUnderstanding(undefined);
    setReceptionSessionId(null);
    persistSkip.current = true;
  }, [lang]);

  useEffect(() => {
    if (!mounted) return;
    let forced = false;
    try {
      if (window.sessionStorage.getItem("kindred:home:focus") === "1") {
        window.sessionStorage.removeItem("kindred:home:focus");
        forced = true;
      }
    } catch {
      /* noop */
    }
    const isDesktop =
      typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    if (forced || isDesktop) taRef.current?.focus();
  }, [mounted]);

  function buildGraftForHandoff(
    prior: ReceptionMsg[],
    userBody: string,
    assistantReply?: string,
  ): GraftedMessage[] {
    const out: GraftedMessage[] = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    out.push({ role: "user", content: userBody });
    const reply = assistantReply?.trim();
    if (!reply) return out;
    const lastAssistant = [...out].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.content.trim() === reply) return out;
    out.push({ role: "assistant", content: reply });
    return out;
  }

  function goHandoff(opts: {
    target: "matchmaker" | "sidebyside";
    seed: string;
    summary: string;
    understanding?: UserUnderstanding;
    history: GraftedMessage[];
    sideHints?: OrchestratorOutput["sideBySideHints"];
    transition?: string;
  }) {
    const handoff: HandoffContext = {
      from: "orchestrator",
      parentSessionId: receptionSessionId ?? undefined,
      seed: opts.seed,
      summary: opts.summary || opts.seed,
      understanding: opts.understanding,
      sideBySideHints: opts.sideHints,
      graftedMessages: opts.history,
      handoffCount: 0,
      transitionReply: opts.transition,
    };
    if (opts.target === "sidebyside") {
      const s = openSideBySideFromHandoff(handoff, receptionSessionId ?? undefined);
      if (receptionSessionId) setActiveThreadId(s.threadId);
      void navigate({ to: "/side-by-side", search: { session: s.id, chatWith: "" } });
      return;
    }
    const s = openMatchmakerFromHandoff(handoff, receptionSessionId ?? undefined);
    if (receptionSessionId) setActiveThreadId(s.threadId);
    void navigate({ to: "/matchmaker", search: { session: s.id } });
  }

  async function submit(override?: string, opts?: { forcedTarget?: AgentId | null }) {
    const body = (override ?? text).trim();
    if (!body || thinking) return;
    if (!user) {
      void navigate({ to: "/auth", search: { mode: "signin", redirect: "/" } });
      return;
    }

    let sid = receptionSessionId;
    if (!sid) {
      const sess = createSession("reception", seedForNewSession({ userText: body }), { messages: [] });
      sid = sess.id;
      setActiveThreadId(sess.threadId);
      setReceptionSessionId(sid);
      persistSkip.current = false;
      void navigate({ to: "/", search: { thread: sess.threadId } as Record<string, string>, replace: true });
    }

    const historyBefore = [...reception, { role: "user" as const, content: body }];
    flushSync(() => {
      setReception(historyBefore);
      setText("");
      setSuggestions([]);
    });
    setThinking(true);

    try {
      let streaming = false;
      const result = await requestOrchestratorTurn({
        lang,
        userMessage: body,
        history: reception,
        forcedTarget: opts?.forcedTarget ?? null,
        onDelta: (chunk) => {
          flushSync(() => {
            if (!streaming) {
              streaming = true;
              setReception((prev) => [...prev, { role: "assistant", content: chunk }]);
              setThinking(false);
              return;
            }
            setReception((prev) => {
              if (!prev.length) return prev;
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role !== "assistant") return prev;
              copy[copy.length - 1] = { ...last, content: chunk };
              return copy;
            });
          });
        },
      });

      setLastUnderstanding(result.understanding);

      if (result.action === "error") {
        setReception((prev) => {
          if (streaming) {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: result.reply || t("home.reception_error"),
              };
              return copy;
            }
          }
          return [...prev, { role: "assistant", content: result.reply || t("home.reception_error") }];
        });
        setSuggestions(result.suggestions ?? []);
        return;
      }

      if (result.action === "handoff" && result.target) {
        goHandoff({
          target: result.target,
          seed: body,
          summary: result.summary || body,
          understanding: result.understanding ?? lastUnderstanding,
          history: buildGraftForHandoff(reception, body),
          sideHints: result.sideBySideHints,
        });
        return;
      }

      const reply = result.reply || t("home.reception_clarify");
      setReception((prev) => {
        if (streaming) {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = { ...last, content: reply };
            return copy;
          }
        }
        return [...prev, { role: "assistant", content: reply }];
      });
      setSuggestions(result.suggestions ?? []);
    } catch (e) {
      console.error("[home orchestrator]", e);
      console.error("[home orchestrator detail]", {
        name: e instanceof Error ? e.name : typeof e,
        message: e instanceof Error ? e.message : String(e),
      });
      setReception((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("home.reception_error"),
        },
      ]);
      setSuggestions([]);
    } finally {
      setThinking(false);
    }
  }

  const inReception = reception.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inReception) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [reception, thinking, suggestions, inReception]);

  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  const suggestionRow =
    suggestions.length > 0 && !thinking ? (
      <div className="mb-2 flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.slice(0, 4).map((s) => (
          <button
            key={s}
            type="button"
            disabled={thinking}
            onClick={(e) => {
              e.preventDefault();
              setText(s);
              requestAnimationFrame(() => {
                const el = taRef.current;
                if (!el) return;
                autosize(el);
                el.focus();
                const len = s.length;
                el.setSelectionRange(len, len);
              });
            }}
            className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    ) : null;

  const composer = (
    <div>
      {suggestionRow}
      <div className="rounded-3xl border border-border bg-card shadow-sm-soft focus-within:border-foreground/30 transition-colors">
        <div className="px-4 md:px-5 pt-3 md:pt-4 pb-2">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autosize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder={mounted ? t("home.placeholder") : ""}
            className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed text-foreground placeholder:text-subtle-foreground"
            suppressHydrationWarning
          />
        </div>

        <div className="px-2.5 md:px-3 pb-2.5 md:pb-3 pt-1 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 pl-1.5">
            {AGENT_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={thinking}
                onClick={() => {
                  if (thinking) return;
                  void submit(t(c.promptKey), { forcedTarget: c.id });
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground hover:border-foreground/20 disabled:opacity-40 transition-colors"
                suppressHydrationWarning
              >
                <c.Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span suppressHydrationWarning>
                  {mounted ? t(c.labelKey) : "\u00A0"}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || thinking}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 md:w-9 md:h-9 rounded-full bg-primary text-primary-foreground disabled:bg-input disabled:text-subtle-foreground disabled:cursor-not-allowed hover:bg-primary-hover transition-colors"
            aria-label={t("home.send")}
            suppressHydrationWarning
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-dvh bg-background flex flex-col pb-tabbar overflow-hidden" suppressHydrationWarning>
      <AppChromeHeader />

      {!inReception ? (
        <main className="flex-1 min-h-0 flex flex-col px-5 md:px-6">
          <div className="w-full max-w-3xl md:mx-auto flex-1 min-h-0 flex flex-col justify-center md:justify-start md:pt-[16vh] gap-6 md:gap-8">
            <h1
              key={i18n.language}
              className="w-full text-center md:text-left text-[28px] sm:text-[36px] md:text-[44px] font-semibold tracking-[-0.02em] leading-[1.15] text-foreground min-h-[1.15em]"
            >
              {mounted ? t("home.greeting") : "\u00A0"}
            </h1>
            <div className="w-full pb-[max(env(safe-area-inset-bottom),12px)] md:pb-8">{composer}</div>
          </div>
        </main>
      ) : (
        <main className="flex-1 min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 md:px-6"
          >
            <div className="w-full max-w-3xl mx-auto py-4 space-y-3">
              {reception.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-8 rounded-2xl bg-secondary px-3.5 py-2.5 text-[14px] text-foreground"
                      : "mr-8 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-[14px] text-foreground"
                  }
                >
                  {m.content}
                </div>
              ))}
              {thinking && (
                <p className="text-[13px] text-muted-foreground">{t("chat.starting")}</p>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background px-5 md:px-6 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            <div className="w-full max-w-3xl mx-auto">{composer}</div>
          </div>
        </main>
      )}
    </div>
  );
}
