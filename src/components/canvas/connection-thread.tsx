import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { get, markSeen, send, subscribe, type Connection } from "@/lib/connections";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import { loadUnderstanding } from "@/lib/understanding";

interface Props { personId: string; }

export function ConnectionThread({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [conn, setConn] = useState<Connection | null>(() => get(personId));
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribe(() => setConn(get(personId)));
    setConn(get(personId));
    markSeen(personId);
    return () => { unsub(); };
  }, [personId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conn?.messages.length]);

  const person = getPersonById(personId);
  if (!person || !conn || conn.status !== "connected") return null;
  const loc = localized(person, lang);

  function submit() {
    const v = text.trim();
    if (!v) return;
    send(personId, v);
    setText("");
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <img src={avatarUrl(person.id)} alt={loc.name} className="w-9 h-9 rounded-full border border-border" />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-foreground truncate">{loc.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{loc.occupation} · {loc.city}</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-md mx-auto">
          {/* Anchor: what both sides have already seen */}
          <HelloAnchor conn={conn} person={person} lang={lang} />

          <ul className="space-y-2.5">
            {conn.messages.map((m) => (
              <li key={m.id} className={m.from === "me" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.from === "me"
                      ? "max-w-[80%] rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-[14px] leading-relaxed"
                      : "max-w-[80%] rounded-2xl rounded-bl-md bg-secondary text-foreground px-3.5 py-2 text-[14px] leading-relaxed"
                  }
                >
                  {m.text}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-md mx-auto relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder={t("connection.composer_placeholder")}
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Send"
            className="absolute right-2 bottom-1.5 w-8 h-8 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-25 hover:opacity-90 transition-opacity"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HelloAnchor({ conn, person, lang }: {
  conn: Connection;
  person: NonNullable<ReturnType<typeof getPersonById>>;
  lang: Lang;
}) {
  const { t } = useTranslation();
  const myMoment = person.moments.find((m) => m.id === conn.fromMe.quotedMomentId);
  const myPrompt = myMoment ? getMomentPromptById(myMoment.promptId) : null;

  const u = loadUnderstanding();
  const userMoment = conn.fromThem
    ? u.userMoments.find((m) => m.promptId === conn.fromThem!.quotedUserMomentPromptId)
    : null;
  const theirPrompt = userMoment ? getMomentPromptById(userMoment.promptId) : null;

  return (
    <div className="mb-6 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
        {t("moment.anchor_label")}
      </div>

      {/* What I said to them */}
      {myMoment && (
        <article className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
            {t("moment.you_to_them")}
          </div>
          {myPrompt && (
            <p className="text-[11px] italic text-muted-foreground mb-0.5">
              {localizedMomentPrompt(myPrompt, lang)}
            </p>
          )}
          <p className="text-[13px] text-foreground leading-snug">
            {lang === "zh-CN" ? myMoment.answer_zh : myMoment.answer}
          </p>
          <p className="mt-2 text-[13px] text-foreground leading-snug">
            <span className="text-muted-foreground">— </span>"{conn.fromMe.reply}"
          </p>
        </article>
      )}

      {/* What they said back */}
      {conn.fromThem && userMoment && (
        <article className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
            {t("moment.them_to_you")}
          </div>
          {theirPrompt && (
            <p className="text-[11px] italic text-muted-foreground mb-0.5">
              {localizedMomentPrompt(theirPrompt, lang)}
            </p>
          )}
          <p className="text-[13px] text-foreground leading-snug">
            {userMoment.answer}
          </p>
          <p className="mt-2 text-[13px] text-foreground leading-snug">
            <span className="text-muted-foreground">— </span>"{conn.fromThem.reply}"
          </p>
        </article>
      )}
    </div>
  );
}
