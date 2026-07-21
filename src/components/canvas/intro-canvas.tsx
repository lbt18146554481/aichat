import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { MatchmakerState } from "@/lib/agents/matchmaker";
import { get, sayHello, subscribe, type Connection } from "@/lib/connections";
import { HelloComposer } from "@/components/hello-composer";
import { hasName, isVitalsComplete, loadProfile } from "@/lib/profile";
import {
  isPersonSaved,
  removeSavedPerson,
  savePerson,
  subscribeSavedPeople,
} from "@/lib/saved-people";
import { BookmarkPlus, BookmarkCheck } from "lucide-react";

interface Props {
  state: MatchmakerState;
  sessionId: string;
  /** Mark current person as passed and advance. Used for the neutral browse
   *  action before any hello has been sent. */
  onPassAndNext: () => void;
  /** Advance to the next person WITHOUT marking current as passed. Used
   *  after Say hello / connected / faded — the user isn't rejecting them. */
  onSeeNextPerson: () => void;
}

// Per-person composer draft — survives a jump to /profile and back so the
// user never loses the reply they were writing.
interface IntroDraft { composing: boolean; picked: string | null; reply: string }
const draftKey = (personId: string) => `kindred:intro:draft:${personId}`;
function loadDraft(personId: string): IntroDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(personId));
    return raw ? (JSON.parse(raw) as IntroDraft) : null;
  } catch { return null; }
}
function saveDraft(personId: string, d: IntroDraft) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(draftKey(personId), JSON.stringify(d)); } catch { /* noop */ }
}
function clearDraft(personId: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(draftKey(personId)); } catch { /* noop */ }
}

// Per-person scroll position on the right-pane scroller — persists across a
// jump to /connections so "back to intro" lands where the user left off.
const scrollKey = (personId: string) => `kindred:intro:scroll:${personId}`;

export function IntroCanvas({ state, sessionId, onPassAndNext, onSeeNextPerson }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const person = state.currentPersonId ? getPersonById(state.currentPersonId) : null;
  const [conn, setConn] = useState<Connection | null>(
    person ? get(person.id) : null,
  );
  const [composing, setComposing] = useState(false);
  const [draftPicked, setDraftPicked] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [saved, setSaved] = useState<boolean>(() => (person ? isPersonSaved(person.id) : false));
  const restoredRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Scroll position on the right-pane scroll container, captured when
  // entering the composer so "← Back" restores exactly where the user was.
  const savedScrollRef = useRef<{ el: HTMLElement; top: number } | null>(null);

  function getScrollParent(): HTMLElement | null {
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const style = window.getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  }


  // Track saved state for the current person; auto-remove once a real
  // connection begins — Save is a pre-decision holding pattern only.
  useEffect(() => {
    if (!person) { setSaved(false); return; }
    const check = () => setSaved(isPersonSaved(person.id));
    check();
    return subscribeSavedPeople(check);
  }, [person?.id]);

  useEffect(() => {
    if (person && conn && conn.status !== "faded" && isPersonSaved(person.id)) {
      removeSavedPerson(person.id);
    }
  }, [person?.id, conn?.status]);

  useEffect(() => {
    setConn(person ? get(person.id) : null);
    // Restore composer draft for this person (if any).
    if (person) {
      const d = loadDraft(person.id);
      if (d) {
        setComposing(d.composing);
        setDraftPicked(d.picked);
        setDraftReply(d.reply);
      } else {
        setComposing(false);
        setDraftPicked(null);
        setDraftReply("");
      }
      restoredRef.current = person.id;
    }
    const unsub = subscribe(() => setConn(person ? get(person.id) : null));
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  // Persist draft whenever it changes (only after restore has run).
  useEffect(() => {
    if (!person || restoredRef.current !== person.id) return;
    if (!composing && !draftPicked && !draftReply) {
      clearDraft(person.id);
      return;
    }
    saveDraft(person.id, { composing, picked: draftPicked, reply: draftReply });
  }, [person, composing, draftPicked, draftReply]);

  if (!person) {
    return (
      <div className="h-full grid place-items-center px-8 py-12">
        <div className="max-w-sm text-center">
          <div className="w-10 h-10 mx-auto rounded-full border border-dashed border-border" />
          <h2 className="mt-5 text-[15px] font-medium text-foreground">
            {t("intro.empty_title")}
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            {t("intro.empty_hint")}
          </p>
        </div>
      </div>
    );
  }

  const loc = localized(person, lang);
  const moments = person.moments;
  const work = person.oneWork;

  function requestSayHello() {
    const p = loadProfile();
    if (!hasName(p) || !isVitalsComplete(p)) {
      try {
        window.sessionStorage.setItem("kindred:profile:return", "/matchmaker");
      } catch { /* noop */ }
      void navigate({ to: "/profile" });
      return;
    }
    const el = getScrollParent();
    if (el) savedScrollRef.current = { el, top: el.scrollTop };
    setComposing(true);
  }

  function handleHello(quotedMomentId: string | null, reply: string) {
    sayHello(person!.id, { quotedMomentId, reply });
    setComposing(false);
    setDraftPicked(null);
    setDraftReply("");
    clearDraft(person!.id);
    savedScrollRef.current = null;
  }

  function handleCancel() {
    setComposing(false);
    setDraftPicked(null);
    setDraftReply("");
    clearDraft(person!.id);
    const snap = savedScrollRef.current;
    savedScrollRef.current = null;
    if (snap) {
      // Restore after the layout settles from leaving composing mode.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          snap.el.scrollTo({ top: snap.top });
        });
      });
    }
  }


  return (
    <div ref={rootRef} className="h-full px-8 py-10">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="flex items-start gap-4">
          <img
            src={avatarUrl(person.id)}
            alt={loc.name}
            className="w-16 h-16 rounded-full border border-border bg-secondary shrink-0"
          />
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-[19px] font-semibold tracking-tight text-foreground">
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
        </div>

        {/* Moments — clickable while composing to attach an optional quote */}
        <div className="mt-7 space-y-4">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {composing
              ? t("moment.compose_hint")
              : t("moment.about_them", { name: loc.name })}
          </div>
          {moments.length === 0 && (
            <p className="text-[13px] text-muted-foreground italic">{loc.portrait}</p>
          )}
          {moments.map((m) => {
            const prompt = getMomentPromptById(m.promptId);
            const active = composing && draftPicked === m.id;
            const content = (
              <>
                {prompt && (
                  <div className="text-[11px] text-muted-foreground italic leading-snug mb-1">
                    {localizedMomentPrompt(prompt, lang)}
                  </div>
                )}
                <p className="text-[14.5px] leading-[1.65] text-foreground">
                  {lang === "zh-CN" ? m.answer_zh : m.answer}
                </p>
              </>
            );
            if (composing) {
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDraftPicked(active ? null : m.id)}
                  className={[
                    "block w-full text-left border-l-2 pl-3 transition-colors",
                    active ? "border-foreground" : "border-border hover:border-foreground/50",
                  ].join(" ")}
                >
                  {content}
                </button>
              );
            }
            return (
              <article key={m.id} className="border-l-2 border-border pl-3">
                {content}
              </article>
            );
          })}
        </div>

        {/* One Work */}
        {work && (
          <div className="mt-7 rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("intro.one_work_label", { kind: t(`profile.kind.${work.kind}`) })}
            </div>
            <div className="text-[14px] font-medium text-foreground leading-snug">
              {lang === "zh-CN" && work.title_zh ? work.title_zh : work.title}
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
              {lang === "zh-CN" ? work.why_zh : work.why}
            </p>
          </div>
        )}

        {/* Primary closed-loop actions — Say hello / Save side by side,
            with a soft "see someone else" link below. */}
        <div className="mt-7 pt-5 border-t border-border">
          {!conn && !composing && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={requestSayHello}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  {t("connection.say_hello")}
                </button>
                <button
                  onClick={() => {
                    if (!person) return;
                    if (saved) removeSavedPerson(person.id);
                    else savePerson(person.id, sessionId);
                  }}
                  aria-pressed={saved}
                  className={[
                    "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border text-[13px] font-medium transition-colors",
                    saved
                      ? "border-foreground/70 bg-secondary text-foreground"
                      : "border-border text-foreground/85 hover:bg-secondary",
                  ].join(" ")}
                >
                  {saved ? (
                    <>
                      <BookmarkCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {t("connection.saved")}
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {t("connection.save")}
                    </>
                  )}
                </button>
                <button
                  onClick={onPassAndNext}
                  className="px-3 py-2.5 rounded-md text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("intro.see_someone_else")}
                </button>
              </div>
              {saved ? (
                <p className="text-[11.5px] text-muted-foreground leading-snug">
                  {t("connection.save_hint_saved")}{" "}
                  <button
                    onClick={onPassAndNext}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {t("intro.see_someone_else")}
                  </button>
                </p>
              ) : (
                <p className="text-[11.5px] text-muted-foreground leading-snug">
                  {t("connection.save_hint")}
                </p>
              )}
            </div>
          )}

          {!conn && composing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("intro.back_to_actions")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!person) return;
                    if (!saved) savePerson(person.id, sessionId);
                    handleCancel();
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <BookmarkPlus className="w-3 h-3" strokeWidth={1.75} />
                  {t("connection.save_and_later")}
                </button>
              </div>
              <HelloComposer
                moments={moments}
                lang={lang}
                initialPicked={draftPicked}
                initialReply={draftReply}
                onDraftChange={(picked, reply) => {
                  setDraftPicked(picked);
                  setDraftReply(reply);
                }}
                onSubmit={handleHello}
                onCancel={handleCancel}
              />
            </div>
          )}

          {conn?.status === "sent" && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-[12.5px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                {t("connection.delivered")}
              </div>
              {conn.fromMe && <YourHelloRecap fromMe={conn.fromMe} person={person} lang={lang} />}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={onSeeNextPerson}
                  className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  {t("intro.next_person_after")}
                </button>
                <Link
                  to="/connections"
                  search={{ open: person.id }}
                  className="px-3 py-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("intro.check_progress")}
                </Link>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                {t("intro.after_hello_hint")}
              </p>
            </div>
          )}

          {conn?.status === "connected" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/connections"
                  search={{ open: person.id }}
                  className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  {t("connection.open_conversation")}
                </Link>
                <button
                  onClick={onSeeNextPerson}
                  className="px-3 py-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("intro.while_you_chat")}
                </button>
              </div>
              <span className="block text-[12px] text-muted-foreground">{t("connection.connected_note")}</span>
            </div>
          )}

          {conn?.status === "faded" && (
            <div className="space-y-2">
              <p className="text-[12.5px] text-muted-foreground leading-snug">
                {t("intro.faded_note")}
              </p>
              <button
                onClick={onSeeNextPerson}
                className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                {t("intro.see_someone_else")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function YourHelloRecap({
  fromMe, person, lang,
}: { fromMe: NonNullable<Connection["fromMe"]>; person: ReturnType<typeof getPersonById>; lang: Lang }) {
  const { t } = useTranslation();
  if (!person) return null;
  const m = person.moments.find((mm) => mm.id === fromMe.quotedMomentId);
  if (!m) return null;
  const prompt = getMomentPromptById(m.promptId);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-1.5">
        {t("moment.you_quoted")}
      </div>
      {prompt && (
        <div className="text-[11px] italic text-muted-foreground mb-0.5">
          {localizedMomentPrompt(prompt, lang)}
        </div>
      )}
      <p className="text-[13px] text-foreground leading-snug">
        {lang === "zh-CN" ? m.answer_zh : m.answer}
      </p>
      <div className="mt-2 pt-2 border-t border-border text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-1">
        {t("moment.you_wrote")}
      </div>
      <p className="text-[13px] text-foreground leading-snug">"{fromMe.reply}"</p>
    </div>
  );
}
