import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import { get, subscribe, type Connection } from "@/lib/connections";
import { setFocusPerson } from "@/lib/seed";

interface Props { personId: string; }

export function SentWaitingPane({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const [conn, setConn] = useState<Connection | null>(() => get(personId));

  useEffect(() => {
    setConn(get(personId));
    const unsub = subscribe(() => setConn(get(personId)));
    return () => { unsub(); };
  }, [personId]);

  const person = getPersonById(personId);
  if (!person || !conn || conn.status !== "sent") return null;
  const loc = localized(person, lang);
  const m = conn.fromMe
    ? person.moments.find((mm) => mm.id === conn.fromMe!.quotedMomentId)
    : null;
  const prompt = m ? getMomentPromptById(m.promptId) : null;

  function backToIntro() {
    setFocusPerson(personId);
    void navigate({ to: "/matchmaker" });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={backToIntro}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="truncate max-w-[220px]">{t("connection.back_to_intro", { name: loc.name })}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-md mx-auto">
          <div className="flex items-start gap-4">
            <img
              src={avatarUrl(person.id)}
              alt={loc.name}
              className="w-14 h-14 rounded-full border border-border bg-secondary shrink-0"
            />
            <div className="min-w-0 pt-0.5">
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground mb-1">
                {t("connection.delivered")}
              </div>
              <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
                {t("connection.waiting_title", { name: loc.name })}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {loc.occupation} · {loc.city}
              </p>
            </div>
          </div>

          {m && conn.fromMe && (
            <article className="mt-7 rounded-lg border border-border bg-card px-4 py-3">
              <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                {t("moment.you_quoted")}
              </div>
              {prompt && (
                <p className="text-[11px] italic text-muted-foreground mb-0.5">
                  {localizedMomentPrompt(prompt, lang)}
                </p>
              )}
              <p className="text-[13.5px] text-foreground leading-snug">
                {lang === "zh-CN" ? m.answer_zh : m.answer}
              </p>
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                  {t("moment.you_wrote")}
                </div>
                <p className="text-[14px] text-foreground leading-relaxed">"{conn.fromMe.reply}"</p>
              </div>
            </article>
          )}

          <p className="mt-6 text-[12.5px] text-muted-foreground leading-relaxed">
            {t("connection.waiting_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
