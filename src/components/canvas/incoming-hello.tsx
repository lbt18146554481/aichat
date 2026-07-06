import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import {
  dismissIncoming,
  get,
  respondToIncoming,
  subscribe,
  type Connection,
} from "@/lib/connections";
import { HelloComposer } from "@/components/hello-composer";
import { loadProfile } from "@/lib/profile";

interface Props { personId: string; }

export function IncomingHello({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [conn, setConn] = useState<Connection | null>(() => get(personId));
  const [picked, setPicked] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    setConn(get(personId));
    setPicked(null);
    setReply("");
    const unsub = subscribe(() => setConn(get(personId)));
    return () => { unsub(); };
  }, [personId]);

  const person = getPersonById(personId);
  if (!person || !conn || conn.status !== "incoming" || !conn.fromThem) return null;

  const loc = localized(person, lang);
  const profile = loadProfile();
  const userMoment = profile.moments.find(
    (m) => m.promptId === conn.fromThem!.quotedUserMomentPromptId,
  );
  const quotedPrompt = userMoment ? getMomentPromptById(userMoment.promptId) : null;

  function handleRespond(quotedMomentId: string | null, replyText: string) {
    respondToIncoming(personId, { quotedMomentId, reply: replyText });
  }

  function handleDismiss() {
    dismissIncoming(personId);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-6 py-10">
        {/* Header — who they are */}
        <div className="flex items-start gap-4">
          <img
            src={avatarUrl(person.id)}
            alt={loc.name}
            className="w-14 h-14 rounded-full border border-border bg-secondary shrink-0"
          />
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground mb-1">
              {t("incoming.label")}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
                {loc.name}
              </h2>
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {person.age}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {loc.occupation} · {loc.city}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t("incoming.dismiss")}
            title={t("incoming.dismiss")}
            className="shrink-0 w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* What they read of you + what they wrote */}
        {userMoment && (
          <article className="mt-7 rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
              {t("incoming.they_read")}
            </div>
            {quotedPrompt && (
              <p className="text-[11px] italic text-muted-foreground mb-0.5">
                {localizedMomentPrompt(quotedPrompt, lang)}
              </p>
            )}
            <p className="text-[13.5px] text-foreground leading-snug">
              {userMoment.answer}
            </p>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                {t("incoming.they_wrote", { name: loc.name })}
              </div>
              <p className="text-[14px] text-foreground leading-relaxed">
                "{conn.fromThem.reply}"
              </p>
            </div>
          </article>
        )}

        {/* Their moments — I can pick one to quote back */}
        {person.moments.length > 0 && (
          <div className="mt-7 space-y-3">
            <div className="text-[9.5px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
              {t("incoming.pick_to_reply", { name: loc.name })}
            </div>
            {person.moments.map((m) => {
              const p = getMomentPromptById(m.promptId);
              const active = picked === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPicked(active ? null : m.id)}
                  className={[
                    "block w-full text-left border-l-2 pl-3 py-0.5 transition-colors",
                    active ? "border-foreground" : "border-border hover:border-foreground/50",
                  ].join(" ")}
                >
                  {p && (
                    <div className="text-[11px] italic text-muted-foreground mb-1">
                      {localizedMomentPrompt(p, lang)}
                    </div>
                  )}
                  <p className="text-[14px] leading-relaxed text-foreground">
                    {lang === "zh-CN" ? m.answer_zh : m.answer}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Composer */}
        <div className="mt-6 pt-5 border-t border-border">
          <HelloComposer
            moments={person.moments}
            lang={lang}
            initialPicked={picked}
            initialReply={reply}
            onDraftChange={(p, r) => { setPicked(p); setReply(r); }}
            onSubmit={handleRespond}
            onCancel={handleDismiss}
          />
          <p className="mt-3 text-[11.5px] text-muted-foreground leading-snug">
            {t("incoming.hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
