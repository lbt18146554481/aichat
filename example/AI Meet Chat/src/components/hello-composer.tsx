import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { Moment } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

interface Props {
  // Full list of the person's moments — used only to render the currently
  // quoted one (if any). Selection happens outside, on the moments already
  // shown above the composer.
  moments: Moment[];
  lang: Lang;
  initialPicked?: string | null;
  initialReply?: string;
  onDraftChange?: (picked: string | null, reply: string) => void;
  onSubmit: (quotedMomentId: string | null, reply: string) => void;
  onCancel: () => void;
}

export function HelloComposer({
  moments,
  lang,
  initialPicked,
  initialReply,
  onDraftChange,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(initialPicked ?? null);
  const [reply, setReply] = useState(initialReply ?? "");

  useEffect(() => {
    onDraftChange?.(picked, reply);
  }, [picked, reply, onDraftChange]);
  // Follow external picked changes (user clicks a Moment above the composer).
  useEffect(() => {
    setPicked(initialPicked ?? null);
  }, [initialPicked]);

  function submit() {
    const v = reply.trim();
    if (!v) return;
    onSubmit(picked, v);
  }

  const quoted = picked ? (moments.find((m) => m.id === picked) ?? null) : null;
  const quotedPrompt = quoted ? getMomentPromptById(quoted.promptId) : null;

  return (
    <div className="space-y-3">
      {quoted && (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {quotedPrompt && (
                <div className="text-[10.5px] uppercase tracking-wide font-mono text-muted-foreground mb-1">
                  {localizedMomentPrompt(quotedPrompt, lang)}
                </div>
              )}
              <p className="text-[13px] leading-snug text-foreground">
                {lang === "zh-CN" ? quoted.answer_zh : quoted.answer}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="shrink-0 text-[14px] leading-none text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t("moment.remove_quote")}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={4}
        placeholder={
          quoted ? t("moment.reply_placeholder_quoted") : t("moment.reply_placeholder_open")
        }
        className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("moment.cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!reply.trim()}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-30 hover:opacity-90 transition-opacity"
        >
          {t("moment.send_hello")}
        </button>
      </div>
    </div>
  );
}
