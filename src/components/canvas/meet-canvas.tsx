import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, RefreshCw, ArrowRight } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { SideState, WhenTier, LevelTier } from "@/lib/agents/side-by-side";
import { currentView, ALL_KINDS } from "@/lib/agents/side-by-side";
import type { ActivityKind, Weekday } from "@/lib/types";

interface Props {
  state: SideState;
  onSubmitPrompt: (text: string) => void;
  onResolveAmbiguity: (kind: ActivityKind) => void;
  onChooseFromFallback: (kind: ActivityKind) => void;
  onAnswerSlot: (slot: "when" | "level", value: WhenTier | LevelTier | "any") => void;
  onSwap: () => void;
  onSayHello: () => void;
  onRestart: () => void;
  onTryNearMiss: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
}

const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾", run: "🏃", climb: "🧗", cook: "🍳", exhibition: "🖼", bookstore: "📚",
};

export function MeetCanvas(props: Props) {
  const view = currentView(props.state);
  if (view === "prompt")       return <PromptView onSubmit={props.onSubmitPrompt} truncated={props.state.truncated} />;
  if (view === "disambiguate") return <DisambiguateView kinds={props.state.ambiguousKinds ?? []} onPick={props.onResolveAmbiguity} onRestart={props.onRestart} />;
  if (view === "fallback")     return <FallbackView onPick={props.onChooseFromFallback} onRestart={props.onRestart} />;
  if (view === "ask")          return <AskView slot={props.state.pendingAsk!} kind={props.state.intent?.kind ?? "tennis"} onAnswer={props.onAnswerSlot} onRestart={props.onRestart} />;
  if (view === "candidate")    return <CandidateView state={props.state} onSwap={props.onSwap} onSayHello={props.onSayHello} onRestart={props.onRestart} />;
  return <NearMissView state={props.state} onTry={props.onTryNearMiss} onRestart={props.onRestart} />;
}

// ---- Prompt -------------------------------------------------------------

function PromptView({ onSubmit, truncated }: { onSubmit: (text: string) => void; truncated: boolean }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const disabled = text.trim().length === 0;

  function submit() {
    if (disabled) return;
    onSubmit(text.trim());
  }

  return (
    <div className="h-full px-6 py-12 overflow-y-auto">
      <div className="mx-auto max-w-lg">
        <h1 className="text-[24px] sm:text-[28px] font-serif italic leading-snug text-foreground text-center">
          {t("meet.prompt_hero")}
        </h1>
        <p className="mt-3 text-[13px] text-muted-foreground text-center leading-relaxed">
          {t("meet.prompt_hint")}
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card p-3">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
            }}
            placeholder={t("meet.prompt_placeholder")}
            rows={4}
            className="w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono text-muted-foreground">{t("meet.prompt_meta")}</span>
            <button
              onClick={submit}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-foreground text-background text-[12.5px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {t("meet.prompt_submit")}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {truncated && (
          <p className="mt-3 text-[11.5px] text-muted-foreground text-center font-mono">
            {t("meet.truncated_hint")}
          </p>
        )}

        <p className="mt-8 text-center text-[11.5px] text-muted-foreground leading-relaxed font-mono">
          {t("meet.disclaimer")}
        </p>
      </div>
    </div>
  );
}

// ---- Disambiguate (L2) --------------------------------------------------

function DisambiguateView({ kinds, onPick, onRestart }: { kinds: ActivityKind[]; onPick: (k: ActivityKind) => void; onRestart: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="h-full px-6 py-16 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono text-center">
          {t("meet.step_clarify")}
        </div>
        <h2 className="mt-3 text-[19px] font-medium text-foreground leading-snug text-center">
          {t("meet.disambiguate_ask")}
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {kinds.map((k) => (
            <ChipButton key={k} onClick={() => onPick(k)} emoji={KIND_EMOJI[k]} label={t(`activity.kind.${k}`)} />
          ))}
        </div>
        <RestartLink onRestart={onRestart} />
      </div>
    </div>
  );
}

// ---- Fallback (L3) ------------------------------------------------------

function FallbackView({ onPick, onRestart }: { onPick: (k: ActivityKind) => void; onRestart: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="h-full px-6 py-16 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono text-center">
          {t("meet.step_clarify")}
        </div>
        <h2 className="mt-3 text-[19px] font-medium text-foreground leading-snug text-center">
          {t("meet.parse_fallback")}
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {ALL_KINDS.map((k) => (
            <ChipButton key={k} onClick={() => onPick(k)} emoji={KIND_EMOJI[k]} label={t(`activity.kind.${k}`)} />
          ))}
        </div>
        <RestartLink onRestart={onRestart} />
      </div>
    </div>
  );
}

// ---- Ask one slot -------------------------------------------------------

function AskView({ slot, kind, onAnswer, onRestart }: { slot: "when" | "level"; kind: ActivityKind; onAnswer: (s: "when" | "level", v: WhenTier | LevelTier | "any") => void; onRestart: () => void }) {
  const { t } = useTranslation();
  const kindLabel = t(`activity.kind.${kind}`);

  const options: Array<{ value: WhenTier | LevelTier | "any"; label: string; hint?: string }> = slot === "when"
    ? [
        { value: "weekend",   label: t("meet.when.weekend"),   hint: t("meet.when.weekend_hint") },
        { value: "weeknight", label: t("meet.when.weeknight"), hint: t("meet.when.weeknight_hint") },
        { value: "any",       label: t("meet.when.any"),       hint: t("meet.when.any_hint") },
      ]
    : [
        { value: "beginner",     label: t("meet.level.beginner") },
        { value: "intermediate", label: t("meet.level.intermediate") },
        { value: "advanced",     label: t("meet.level.advanced") },
        { value: "any",          label: t("meet.level.any") },
      ];

  return (
    <div className="h-full px-6 py-16 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono text-center">
          {t("meet.step_one_more")}
        </div>
        <h2 className="mt-3 text-[19px] font-medium text-foreground leading-snug text-center">
          {slot === "when" ? t("meet.ask_when", { kind: kindLabel }) : t("meet.ask_level", { kind: kindLabel })}
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-1.5">
          {options.map((o) => (
            <button
              key={String(o.value)}
              onClick={() => onAnswer(slot, o.value)}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-foreground/85 hover:border-foreground/40 hover:text-foreground transition-colors"
            >
              <span className="text-[13.5px] font-medium">{o.label}</span>
              {o.hint && <span className="text-[11px] font-mono text-muted-foreground">{o.hint}</span>}
            </button>
          ))}
        </div>
        <RestartLink onRestart={onRestart} />
      </div>
    </div>
  );
}

// ---- Candidate ----------------------------------------------------------

function CandidateView({ state, onSwap, onSayHello, onRestart }: { state: SideState; onSwap: () => void; onSayHello: () => void; onRestart: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const c = state.candidate!;
  const intent = state.intent!;
  const kindLabel = t(`activity.kind.${c.kind}`);
  const dayLabel = t(`activity.day.${c.day}`);
  const winLabel = t(`activity.window.${c.window}`);
  const venue = lang === "zh-CN" ? c.venue_zh : c.venue;
  const reason = lang === "zh-CN" ? c.reason_zh : c.reason;

  return (
    <div className="h-full px-6 py-12 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("meet.pick_label")}
          </div>
          <HeardYou intent={intent} />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-[24px] leading-none">
              {KIND_EMOJI[c.kind]}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">
                {kindLabel} · {dayLabel} {winLabel}
              </div>
              <div className="text-[12px] text-muted-foreground">{venue}</div>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground text-[13px] font-mono">?</div>
            <p className="text-[12.5px] text-foreground/85 leading-relaxed pt-1">{reason}</p>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={onSayHello}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t("meet.say_hello")}
            </button>
            <button
              onClick={onSwap}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("meet.swap")}
            </button>
          </div>
        </div>

        <p className="mt-5 text-[11.5px] text-muted-foreground leading-relaxed">
          {t("meet.pick_footnote")}
        </p>
        <RestartLink onRestart={onRestart} />
      </div>
    </div>
  );
}

// ---- Near-miss / pool exhausted ----------------------------------------

function NearMissView({ state, onTry, onRestart }: { state: SideState; onTry: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void; onRestart: () => void }) {
  const { t } = useTranslation();
  const top = state.nearMisses[0];
  const headline = state.poolExhausted ? t("meet.pool_exhausted") : t("meet.no_one");

  return (
    <div className="h-full px-6 py-16 overflow-y-auto">
      <div className="mx-auto max-w-md text-center">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("meet.pick_label")}
        </div>
        <h2 className="mt-3 text-[19px] font-medium text-foreground leading-snug">{headline}</h2>

        {top ? (
          <>
            <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
              {t("meet.near_hint", {
                day: t(`activity.day.${top.slot.day}`),
                window: t(`activity.window.${top.slot.window}`),
                count: top.personCount,
              })}
            </p>
            <button
              onClick={() => onTry(top.slot)}
              className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              {t("meet.near_try", {
                day: t(`activity.day.${top.slot.day}`),
                window: t(`activity.window.${top.slot.window}`),
              })}
            </button>
          </>
        ) : null}
        <RestartLink onRestart={onRestart} />
      </div>
    </div>
  );
}

// ---- Shared bits --------------------------------------------------------

function HeardYou({ intent }: { intent: { kind: ActivityKind; when?: WhenTier; level?: LevelTier } }) {
  const { t } = useTranslation();
  const bits: string[] = [t(`activity.kind.${intent.kind}`)];
  if (intent.when) bits.push(t(`meet.when.${intent.when}`));
  if (intent.level) bits.push(t(`meet.level.${intent.level}`));
  return (
    <span className="text-[10.5px] font-mono text-muted-foreground truncate max-w-[60%]" title={bits.join(" · ")}>
      {t("meet.heard_you")}: {bits.join(" · ")}
    </span>
  );
}

function ChipButton({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card py-3 text-foreground/80 hover:border-foreground/40 hover:text-foreground transition-colors"
    >
      <span className="text-[22px] leading-none">{emoji}</span>
      <span className="text-[12px]">{label}</span>
    </button>
  );
}

function RestartLink({ onRestart }: { onRestart: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 text-center">
      <button
        onClick={onRestart}
        className="text-[12px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
      >
        {t("meet.restart")}
      </button>
    </div>
  );
}
