import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { Moment } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

interface Props {
  moments: Moment[];
  lang: Lang;
  onSubmit: (quotedMomentId: string, reply: string) => void;
  onCancel: () => void;
}

export function HelloComposer({ moments, lang, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(moments[0]?.id ?? null);
  const [reply, setReply] = useState("");

  function submit() {
    const v = reply.trim();
    if (!picked || !v) return;
    onSubmit(picked, v);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground mb-2">
          {t("moment.pick_one")}
        </div>
        <ul className="space-y-2">
          {moments.map((m) => {
            const prompt = getMomentPromptById(m.promptId);
            const active = picked === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setPicked(m.id)}
                  className={[
                    "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                    active
                      ? "border-foreground bg-background"
                      : "border-border bg-card hover:border-foreground/40",
                  ].join(" ")}
                >
                  {prompt && (
                    <div className="text-[10.5px] uppercase tracking-wide font-mono text-muted-foreground mb-1">
                      {localizedMomentPrompt(prompt, lang)}
                    </div>
                  )}
                  <div className="text-[13px] leading-snug text-foreground">
                    {lang === "zh-CN" ? m.answer_zh : m.answer}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground mb-2">
          {t("moment.your_reply")}
        </div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder={t("moment.reply_placeholder")}
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
          {t("moment.reply_hint")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!picked || !reply.trim()}
          className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium disabled:opacity-30 hover:opacity-90 transition-opacity"
        >
          {t("moment.send_hello")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("moment.cancel")}
        </button>
      </div>
    </div>
  );
}
