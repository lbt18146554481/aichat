import { ArrowUp, PanelRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "./app-header";
import { CanvasPane } from "./canvas-pane";
import { SavedDrawer } from "./saved-drawer";
import { getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import {
  EMPTY_STATE,
  activeSignals,
  actDismiss,
  actFindSimilar,
  actRemoveSignal,
  actSave,
  actSelect,
  actSetCompareMode,
  actTellMore,
  actUnsave,
  loadState,
  resetState,
  runQuery,
  saveState,
  userTurn,
  type AgentState,
  type AssistantPart,
  type Message,
} from "@/lib/agent";

export function Chat() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [state, setState] = useState<AgentState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.messages.length, searching]);

  useEffect(() => {
    if (!searching) inputRef.current?.focus();
  }, [searching]);

  function submit(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || searching) return;
    setInput("");
    const afterUser = userTurn(state, text);
    setState(afterUser);
    setSearching(true);
    window.setTimeout(() => {
      setState(runQuery(afterUser));
      setSearching(false);
    }, 600);
  }

  function handleReset() {
    if (state.messages.length > 0 && !confirm(t("header.reset") + "?")) return;
    setState(resetState());
    setInput("");
  }

  function handleTellMore(id: string) {
    const p = getPersonById(id);
    if (!p) return;
    const name = localized(p, lang).name;
    setState((s) => actTellMore(s, id, name));
  }

  function handleFindSimilar(id: string) {
    const p = getPersonById(id);
    if (!p || searching) return;
    const name = localized(p, lang).name;
    // Push the user-mirrored message first, then animate the searching state
    // so the canvas refresh feels like a real query.
    const withUser = userTurn(state, `Show me more people like ${name}.`);
    // Replace the auto-generated user text with the localized version we want
    // (userTurn already added one — keep it; this mirrors the click intent).
    setState(withUser);
    setSearching(true);
    window.setTimeout(() => {
      const { state: next } = actFindSimilar(state, id, name);
      setState(next);
      setSearching(false);
    }, 600);
  }

  function handleRemoveSignal(sig: string) {
    if (searching) return;
    setSearching(true);
    window.setTimeout(() => {
      setState((s) => actRemoveSignal(s, sig));
      setSearching(false);
    }, 300);
  }

  function openCompare() {
    setState((s) => actSetCompareMode(s, true));
    setSavedOpen(false);
    setCanvasOpen(true);
  }

  const isEmpty = state.messages.length === 0;
  const examples = useMemo(
    () => t("chat.examples", { returnObjects: true }) as string[],
    [t],
  );

  const chips = activeSignals(state);
  const showReadyHint = state.savedIds.length >= 2 && !state.compareMode;

  const canvas = (
    <CanvasPane
      shortlistIds={state.shortlistIds}
      selectedId={state.selectedId}
      savedIds={state.savedIds}
      dismissedIds={state.dismissedIds}
      compareMode={state.compareMode}
      onSelect={(id) => setState((s) => actSelect(s, id))}
      onSave={(id) => setState((s) => actSave(s, id))}
      onDismiss={(id) => setState((s) => actDismiss(s, id))}
      onTellMore={handleTellMore}
      onFindSimilar={handleFindSimilar}
      onExitCompare={() => setState((s) => actSetCompareMode(s, false))}
    />
  );

  // Defer the entire i18n-bound UI until after mount so SSR HTML and the
  // client's first paint always match (avoids hydration mismatches from
  // persisted language).
  if (!hydrated) {
    return <div className="h-screen bg-background" />;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        savedCount={state.savedIds.length}
        onOpenSaved={() => setSavedOpen(true)}
        onReset={state.messages.length > 0 ? handleReset : undefined}
        showReadyHint={showReadyHint}
      />

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] min-h-0">
        {/* LEFT — Chat pane */}
        <section className="flex flex-col min-h-0 border-r border-border">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto px-5 py-7">
              {isEmpty ? (
                <EmptyState examples={examples} onPick={submit} />
              ) : (
                <ul className="space-y-4">
                  {state.messages.map((m) => (
                    <li key={m.id}>
                      {m.role === "user" ? (
                        <UserBubble text={m.text ?? ""} />
                      ) : (
                        <AssistantTurn
                          message={m}
                          onCompare={openCompare}
                          onFindSimilarFromInsight={handleFindSimilar}
                        />
                      )}
                    </li>
                  ))}
                  {searching && (
                    <li>
                      <SearchingRow />
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Mobile shortlist toggle */}
          {!isEmpty && state.shortlistIds.length > 0 && (
            <button
              onClick={() => setCanvasOpen(true)}
              className="lg:hidden mx-5 mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-card text-[12.5px] text-foreground hover:bg-secondary transition-colors"
            >
              <span className="flex items-center gap-2 font-mono">
                <PanelRight className="w-3.5 h-3.5" />
                {t("canvas.title")}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {state.shortlistIds.length}
              </span>
            </button>
          )}

          <div className="border-t border-border bg-background">
            <div className="max-w-xl mx-auto px-5 py-3">
              {chips.length > 0 && (
                <ActiveFilters
                  signals={chips}
                  onRemove={handleRemoveSignal}
                  label={t("chat.active_filters")}
                />
              )}
              <Composer
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSend={() => submit()}
                disabled={searching}
                placeholder={
                  isEmpty ? t("chat.placeholder_first") : t("chat.placeholder_followup")
                }
              />
              <p className="mt-2 text-[10.5px] text-muted-foreground text-center font-mono">
                {t("chat.disclaimer")}
              </p>
            </div>
          </div>
        </section>

        {/* RIGHT — Canvas (desktop) */}
        <section className="hidden lg:block min-h-0">{canvas}</section>
      </div>

      {/* RIGHT — Canvas (mobile sheet) */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity ${
          canvasOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!canvasOpen}
      >
        <div
          className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          onClick={() => setCanvasOpen(false)}
        />
        <aside
          className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col transition-transform ${
            canvasOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-11 px-4 flex items-center justify-between border-b border-border shrink-0">
            <span className="text-[11px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
              {state.compareMode ? t("compare.title") : t("canvas.title")}
            </span>
            <button
              onClick={() => setCanvasOpen(false)}
              aria-label={t("saved.close")}
              className="w-7 h-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">{canvas}</div>
        </aside>
      </div>

      <SavedDrawer
        open={savedOpen}
        savedIds={state.savedIds}
        onClose={() => setSavedOpen(false)}
        onRemove={(id) => setState((s) => actUnsave(s, id))}
        onCompare={openCompare}
        onSelect={(id) => {
          setState((s) => actSelect(s, id));
          setSavedOpen(false);
          setCanvasOpen(true);
        }}
      />
    </div>
  );
}

function EmptyState({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pt-10 sm:pt-16">
      <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
        {t("chat.empty_title")}
      </h1>
      <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
        {t("chat.empty_hint")}
      </p>
      <div className="mt-7">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-mono mb-2">
          {t("chat.examples_label")}
        </div>
        <div className="flex flex-col gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => onPick(ex)}
              className="px-3 py-2 rounded-md border border-border bg-card text-[13px] text-foreground hover:border-foreground/40 hover:bg-secondary transition-colors text-left"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActiveFilters({
  signals,
  onRemove,
  label,
}: {
  signals: string[];
  onRemove: (s: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-2.5">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-mono mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {signals.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onRemove(s)}
            className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-secondary text-foreground text-[11px] font-mono hover:border-foreground/50 transition-colors"
          >
            {t(`signal.${s}`, { defaultValue: s })}
            <X className="w-2.5 h-2.5 text-muted-foreground group-hover:text-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] px-3.5 py-2 rounded-2xl bg-secondary text-foreground text-[14px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({
  message,
  onCompare,
  onFindSimilarFromInsight,
}: {
  message: Message;
  onCompare: () => void;
  onFindSimilarFromInsight: (id: string) => void;
}) {
  const parts = message.parts ?? [];
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => (
        <AssistantPartView
          key={i}
          part={part}
          onCompare={onCompare}
          onFindSimilarFromInsight={onFindSimilarFromInsight}
        />
      ))}
    </div>
  );
}

function AssistantPartView({
  part,
  onCompare,
  onFindSimilarFromInsight,
}: {
  part: AssistantPart;
  onCompare: () => void;
  onFindSimilarFromInsight: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  if (part.kind === "status") {
    const label =
      part.key === "results_one"
        ? t("agent.results_one")
        : part.key === "results_other"
          ? t("agent.results_other", { count: part.count ?? 0 })
          : t("agent.no_more");
    return (
      <p className="text-[13px] text-muted-foreground font-mono leading-relaxed">
        <span className="text-foreground/60 mr-1">›</span>
        {label}
      </p>
    );
  }
  if (part.kind === "followup") {
    return (
      <p className="text-[12.5px] text-muted-foreground leading-relaxed pl-3">
        {t(`agent.${part.key}`)}
      </p>
    );
  }
  if (part.kind === "insight") {
    const p = getPersonById(part.personId);
    if (!p) return null;
    const name = localized(p, lang).name;
    const traits = part.sharedSignals
      .map((s) => t(`signal.${s}`, { defaultValue: s }))
      .join(", ");
    const text = part.sharedSignals.length > 0
      ? t("agent.insight_with_shared", { name, traits })
      : t("agent.insight_no_shared", { name });
    return (
      <div className="flex items-start gap-2">
        <p className="text-[13.5px] text-foreground leading-relaxed flex-1">
          <span className="text-foreground/60 mr-1 font-mono">›</span>
          {text}
        </p>
        <button
          onClick={() => onFindSimilarFromInsight(part.personId)}
          className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md border border-border text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {t("card.find_similar")}
        </button>
      </div>
    );
  }
  if (part.kind === "compare_invite") {
    return (
      <div className="flex items-start gap-2 mt-1 p-2.5 rounded-md border border-foreground/40 bg-secondary/60">
        <p className="text-[13px] text-foreground leading-relaxed flex-1">
          <span className="text-foreground/60 mr-1 font-mono">›</span>
          {t("agent.compare_invite", { count: part.count })}
        </p>
        <button
          onClick={onCompare}
          className="shrink-0 px-2.5 py-1 rounded-md bg-foreground text-background text-[11.5px] font-medium hover:opacity-90 transition-opacity"
        >
          {t("agent.compare_open")}
        </button>
      </div>
    );
  }
  if (part.kind === "ack") {
    return (
      <p className="text-[12px] text-muted-foreground font-mono">
        <span className="text-foreground/60 mr-1">›</span>
        {t(`agent.${part.key}`)}
      </p>
    );
  }
  return null;
}

function SearchingRow() {
  const { t } = useTranslation();
  return (
    <p className="text-[13px] text-muted-foreground font-mono leading-relaxed">
      <span className="text-foreground/60 mr-1">›</span>
      <span className="inline-block w-[7px] h-[12px] align-[-1px] bg-foreground/60 mr-1.5 animate-pulse" />
      {t("agent.searching")}
    </p>
  );
}

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const Composer = ({
  ref,
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: ComposerProps & { ref?: React.Ref<HTMLTextAreaElement> }) => {
  return (
    <div className="relative flex items-end rounded-2xl border border-border bg-background shadow-sm focus-within:border-foreground/40 transition-colors">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        autoFocus
        placeholder={placeholder}
        className="flex-1 resize-none bg-transparent px-4 py-3 pr-12 text-[14.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none max-h-40"
      />
      <button
        onClick={onSend}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        className="absolute right-2 bottom-2 w-8 h-8 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
};
