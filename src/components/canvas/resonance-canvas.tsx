import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import type { CompassState } from "@/lib/agents/compass";
import { getQuestionById } from "@/lib/questions";
import { avatarUrl, getPersonById, localized } from "@/lib/people";

interface Props {
  state: CompassState;
  onReveal: () => void;
  onSkip: () => void;
}

export function ResonanceCanvas({ state, onReveal, onSkip }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  if (state.phase === "asking" || state.phase === "searching") {
    const q = state.currentQuestionId ? getQuestionById(state.currentQuestionId) : null;
    return (
      <div className="h-full grid place-items-center px-8 py-12">
        <div className="max-w-sm text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("compass.question_label")}
          </div>
          <p className="mt-3 text-[17px] leading-snug font-serif italic text-foreground">
            {q ? (lang === "zh-CN" ? q.text_zh : q.text) : t("compass.empty_hint")}
          </p>
          <p className="mt-5 text-[11.5px] text-muted-foreground leading-relaxed font-mono uppercase tracking-wide">
            {state.phase === "searching" ? t("compass.searching") : t("compass.answer_left")}
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "exhausted") {
    return (
      <div className="h-full grid place-items-center px-8 py-12">
        <p className="max-w-sm text-center text-[13px] text-muted-foreground">{t("compass.exhausted")}</p>
      </div>
    );
  }

  const r = state.resonance;
  if (!r) return null;
  const q = getQuestionById(r.questionId);
  if (!q) return null;
  const revealed = state.phase === "resonance_revealed";
  const them = getPersonById(r.theirPersonId);
  const themLoc = them ? localized(them, lang) : null;
  const theirAnswer = lang === "zh-CN" ? r.theirAnswer_zh : r.theirAnswer;

  return (
    <div className="h-full px-8 py-10 overflow-y-auto">
      <div className="mx-auto max-w-2xl">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("compass.both_answered")}
        </div>
        <p className="mt-2 text-[18px] leading-snug font-serif italic text-foreground">
          {lang === "zh-CN" ? q.text_zh : q.text}
        </p>

        <div className="mt-7 grid md:grid-cols-2 gap-4">
          <Card label={t("compass.you_wrote")} text={r.mineAnswer} accent />
          <Card
            label={revealed && themLoc ? `${themLoc.name} · ${themLoc.city}` : t("compass.they_wrote")}
            text={theirAnswer}
            avatar={revealed && them ? avatarUrl(them.id) : null}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {!revealed ? (
            <button
              onClick={onReveal}
              className="px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              {t("compass.reveal")}
            </button>
          ) : null}
          <button
            onClick={onSkip}
            className="px-4 py-2.5 rounded-md border border-border bg-card text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {revealed ? t("compass.next_question") : t("compass.skip")}
          </button>
        </div>

        {!revealed && (
          <p className="mt-5 text-[11.5px] text-muted-foreground font-mono uppercase tracking-wide">
            {t("compass.anon_note")}
          </p>
        )}
      </div>
    </div>
  );
}

function Card({ label, text, accent, avatar }: { label: string; text: string; accent?: boolean; avatar?: string | null }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-foreground/20 bg-card" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 mb-3">
        {avatar && <img src={avatar} alt="" className="w-7 h-7 rounded-full border border-border" />}
        <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">{label}</div>
      </div>
      <p className="text-[14px] leading-[1.75] text-foreground whitespace-pre-wrap">{text}</p>
    </div>
  );
}
