import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { get, isTyping, markSeen, send, subscribe, type Connection } from "@/lib/connections";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import { loadProfile } from "@/lib/profile";
import { setFocusPerson } from "@/lib/seed";

interface Props { personId: string; }

export function ConnectionThread({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const [conn, setConn] = useState<Connection | null>(() => get(personId));
  const [typing, setTyping] = useState<boolean>(() => isTyping(personId));
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const focusedTheirRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => {
      setConn(get(personId));
      setTyping(isTyping(personId));
    });
    setConn(get(personId));
    setTyping(isTyping(personId));
    markSeen(personId);
    return () => { unsub(); };
  }, [personId]);

  const { lastMineId, lastTheirsId } = useMemo(() => {
    const msgs = conn?.messages ?? [];
    let mine: string | null = null;
    let theirs: string | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!mine && msgs[i].from === "me") mine = msgs[i].id;
      if (!theirs && msgs[i].from === "them") theirs = msgs[i].id;
      if (mine && theirs) break;
    }
    return { lastMineId: mine, lastTheirsId: theirs };
  }, [conn?.messages]);

  useEffect(() => {
    // On first arrival with an unseen latest-their reply, center it.
    // Otherwise, scroll to bottom on new messages.
    if (lastTheirsId && focusedTheirRef.current !== lastTheirsId) {
      const el = msgRefs.current[lastTheirsId];
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        focusedTheirRef.current = lastTheirsId;
        return;
      }
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conn?.messages.length, lastTheirsId, typing]);

  const person = getPersonById(personId);
  if (!person || !conn || conn.status !== "connected") return null;
  const loc = localized(person, lang);

  function submit() {
    const v = text.trim();
    if (!v) return;
    send(personId, v);
    setText("");
  }

  function backToIntro() {
    setFocusPerson(personId);
    const session = conn?.originSessionId;
    if (session) void navigate({ to: "/matchmaker", search: { session } });
    else void navigate({ to: "/" });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={backToIntro}
          aria-label={t("connection.back_to_intro", { name: loc.name })}
          className="shrink-0 w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
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
            {conn.messages.map((m) => {
              const isMine = m.from === "me";
              const isLastMine = isMine && m.id === lastMineId;
              const isLastTheirs = !isMine && m.id === lastTheirsId;
              const highlight = isLastMine || isLastTheirs;
              return (
                <li
                  key={m.id}
                  ref={(el) => { msgRefs.current[m.id] = el; }}
                  className={isMine ? "flex flex-col items-end" : "flex flex-col items-start"}
                >
                  {highlight && (
                    <div className="mb-1 text-[9.5px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
                      {isLastMine ? t("connection.your_last") : t("connection.their_reply")}
                    </div>
                  )}
                  <div
                    className={[
                      "max-w-[80%] px-3.5 py-2 text-[14px] leading-relaxed",
                      isMine
                        ? "rounded-2xl rounded-br-md bg-foreground text-background"
                        : "rounded-2xl rounded-bl-md bg-secondary text-foreground",
                      highlight ? "ring-1 ring-foreground/30" : "",
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                </li>
              );
            })}
            {typing && (
              <li className="flex flex-col items-start" aria-live="polite">
                <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-secondary text-foreground/70 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-[pulse_1.2s_ease-in-out_infinite]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-[pulse_1.2s_ease-in-out_0.2s_infinite]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-[pulse_1.2s_ease-in-out_0.4s_infinite]" />
                </div>
              </li>
            )}
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
  const myMoment = conn.fromMe ? person.moments.find((m) => m.id === conn.fromMe!.quotedMomentId) : null;
  const myPrompt = myMoment ? getMomentPromptById(myMoment.promptId) : null;

  const profile = loadProfile();
  const userMoment = conn.fromThem
    ? profile.moments.find((m) => m.promptId === conn.fromThem!.quotedUserMomentPromptId)
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
          {conn.fromMe && (
            <p className="mt-2 text-[13px] text-foreground leading-snug">
              <span className="text-muted-foreground">— </span>"{conn.fromMe.reply}"
            </p>
          )}
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
