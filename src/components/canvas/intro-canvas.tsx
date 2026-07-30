import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { MatchmakerState } from "@/lib/agents/matchmaker";
import { pickBestMoment } from "@/lib/agents/matchmaker";
import { get, sayHello, subscribe, type Connection } from "@/lib/connections";
import { HelloComposer } from "@/components/hello-composer";
import { isProfileComplete, loadProfile, type Profile } from "@/lib/profile";
import { setFocusPerson } from "@/lib/seed";
import { buildReasons, type Reason } from "@/lib/match-reasons";
import type { UserUnderstanding } from "@/lib/understanding";
import type { Person } from "@/lib/types";
import {
  isPersonSaved,
  removeSavedPerson,
  savePerson,
  subscribeSavedPeople,
} from "@/lib/saved-people";
import { PublicProfileSheet } from "@/components/public-profile-sheet";
import { BookmarkPlus, BookmarkCheck, Eye } from "lucide-react";

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

// Set only when the first-time profile gate interrupted a Say hello. Kept in
// place until the user actually sends or cancels, so a remount (or landing on
// a differently ranked person) still reopens the composer instead of asking
// for the profile again.
const RESUME_KEY = "kindred:intro:resume-hello";
function readResumeHello(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(RESUME_KEY); } catch { return null; }
}
function clearResumeHello() {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(RESUME_KEY); } catch { /* noop */ }
}


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
  const [profileOpen, setProfileOpen] = useState(false);
  // My own profile, used to work out why this person might fit.
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  useEffect(() => { setMyProfile(loadProfile()); }, []);

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
    // Restore composer draft for this person (if any), and resume the
    // Say hello composer if we left for the first-time profile gate.
    if (person) {
      const resumeId = readResumeHello();
      const resuming = resumeId !== null && isProfileComplete(loadProfile());
      const d = loadDraft(person.id) ?? (resuming && resumeId !== person.id ? loadDraft(resumeId!) : null);
      if (d) {
        setComposing(d.composing || resuming);
        setDraftPicked(d.picked);
        setDraftReply(d.reply);
      } else {
        setComposing(resuming);
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

  // Persist + restore the right-pane scroll position per person, so leaving
  // to /connections ("Check progress") and returning lands the user back
  // where they were.
  const scrollRestoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!person) return;
    const el = getScrollParent();
    if (!el) return;
    // Restore once per person visit, after layout settles.
    if (scrollRestoredRef.current !== person.id) {
      scrollRestoredRef.current = person.id;
      try {
        const raw = window.sessionStorage.getItem(scrollKey(person.id));
        const top = raw ? parseInt(raw, 10) : NaN;
        if (!Number.isNaN(top)) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { el.scrollTo({ top }); });
          });
        }
      } catch { /* noop */ }
    }
    const onScroll = () => {
      try { window.sessionStorage.setItem(scrollKey(person.id), String(el.scrollTop)); } catch { /* noop */ }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, conn?.status]);





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
  const personId = person.id;


  function requestSayHello(opts?: { pickedMomentId?: string | null; draftReply?: string }) {
    const p = loadProfile();
    if (!isProfileComplete(p)) {
      const nextDraft = {
        composing: true,
        picked: opts?.pickedMomentId ?? draftPicked,
        reply: opts?.draftReply ?? draftReply,
      };
      saveDraft(personId, nextDraft);
      try {
        const url = window.location.pathname + window.location.search;
        window.sessionStorage.setItem("kindred:profile:return", url);
        window.sessionStorage.setItem("kindred:intro:resume-hello", personId);
        // Come back to this exact person, not whoever ranks first after the
        // profile changed.
        setFocusPerson(personId);
        const el = getScrollParent();
        if (el) window.sessionStorage.setItem(scrollKey(personId), String(el.scrollTop));
      } catch { /* noop */ }
      void navigate({ to: "/profile", search: { welcome: 1 } });
      return;
    }
    const el = getScrollParent();
    if (el) savedScrollRef.current = { el, top: el.scrollTop };
    if (opts?.pickedMomentId !== undefined) setDraftPicked(opts.pickedMomentId);
    if (opts?.draftReply !== undefined) setDraftReply(opts.draftReply);
    setComposing(true);
  }

  function handleHello(quotedMomentId: string | null, reply: string) {
    sayHello(person!.id, { quotedMomentId, reply }, sessionId);
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


  const reasons = person && myProfile
    ? buildReasons(person, myProfile, state.understanding, lang)
    : [];
  const bestMoment = pickBestMoment(person, state.understanding);


  function renderMoment(m: NonNullable<typeof bestMoment>, opts: { clickable: boolean; mode: "select" | "quoteAndCompose" }) {
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
    if (opts.clickable) {
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => {
            if (opts.mode === "quoteAndCompose") {
              requestSayHello({ pickedMomentId: m.id });
            } else {
              setDraftPicked(active ? null : m.id);
            }
          }}
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
  }

  return (
    <div ref={rootRef} className="h-full px-6 sm:px-8 pt-8 sm:pt-10 pb-[max(env(safe-area-inset-bottom),1rem)]">

      <div className="mx-auto max-w-md">
        {/* Header — clickable identity opens the public profile sheet */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label={t("intro.view_profile_of", { name: loc.name })}
          className="group w-full flex items-start gap-4 text-left rounded-lg -mx-2 px-2 py-1 hover:bg-secondary/60 transition-colors"
        >
          <div className="relative shrink-0">
            <img
              src={avatarUrl(person.id)}
              alt={loc.name}
              className="w-16 h-16 rounded-full border border-border bg-secondary"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border border-border bg-background grid place-items-center opacity-70 group-hover:opacity-100 transition-opacity">
              <Eye className="w-3 h-3 text-muted-foreground" strokeWidth={1.75} />
            </span>
          </div>
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
        </button>


        {/* Why this person — reasons, each traceable to a real source. */}
        {!composing && myProfile && (
          <WhyThisPerson person={person} lang={lang} reasons={reasons} />
        )}

        {/* One Moment — TA's own voice, clickable to quote & compose.
            Skipped when the "why" card already quotes them, so the same
            sentence never appears twice. */}
        {moments.length > 0 && (composing || reasons.length === 0) && (
          <div className="mt-5 space-y-4">
            {composing && (
              <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                {t("moment.compose_hint")}
              </div>
            )}
            {composing
              ? moments.map((m) => renderMoment(m, { clickable: true, mode: "select" }))
              : bestMoment && renderMoment(bestMoment, { clickable: true, mode: "quoteAndCompose" })}
          </div>
        )}



        {/* Primary closed-loop actions — Say hello / Save side by side,
            with a soft "see someone else" link. */}
        <div className="mt-7 pt-5 border-t border-border">
          {!conn && !composing && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => requestSayHello()}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-11 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
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
                    "inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-md border text-[13px] font-medium transition-colors",
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
                  className="inline-flex items-center justify-center min-h-11 px-3 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {t("intro.see_someone_else")}
                </button>
              </div>

            </div>
          )}

          {!conn && composing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between -mx-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center min-h-11 px-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
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
                  className="inline-flex items-center gap-1.5 min-h-11 px-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
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
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
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
            </div>
          )}

          {conn?.status === "connected" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/connections"
                  search={{ open: person.id }}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
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
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                {t("intro.see_someone_else")}
              </button>
            </div>
          )}
        </div>
      </div>
      <PublicProfileSheet person={person} open={profileOpen} onOpenChange={setProfileOpen} />
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

// ---- Why this person ------------------------------------------------------
//
// The only question this pane has to answer: why might this person fit what
// I just asked for? Every line quotes a real source — your own words in the
// left chat, a work you both listed, or one of their own answers. Nothing is
// summarised or invented. With no evidence we say so and point back to chat.

function WhyThisPerson({
  person, lang, reasons,
}: { person: Person; lang: Lang; reasons: Reason[] }) {
  const { t } = useTranslation();
  const name = localized(person, lang).name;


  return (
    <section className="mt-5 rounded-xl border border-border bg-secondary/35 px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
        {t("why.title", { name })}
      </div>
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-3.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-[13px] leading-relaxed">
              {r.kind === "you_said" && (
                <div className="space-y-1">
                  <p className="text-muted-foreground">
                    {t("why.you_said")}
                    <span className="text-foreground/85">“{r.yours}”</span>
                  </p>
                  <div className="border-l-2 border-border pl-2.5">
                    {r.prompt && (
                      <div className="text-[11px] italic text-muted-foreground leading-snug">
                        {r.prompt}
                      </div>
                    )}
                    <p className="text-foreground/90">
                      {t("why.they_wrote", { name })}
                      <span>“{r.theirs}”</span>
                    </p>
                  </div>
                </div>
              )}
              {r.kind === "favorite" && (
                <div className="space-y-0.5">
                  <p className="text-foreground/90">{t("why.same_favorite", { title: r.title })}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {t("why.they_wrote", { name })}
                    <span>“{r.theirWhy}”</span>
                  </p>
                </div>
              )}
              {r.kind === "values" && (
                <div className="border-l-2 border-border pl-2.5">
                  <div className="text-[11px] italic text-muted-foreground leading-snug">
                    {r.prompt}
                  </div>
                  <p className="text-foreground/90">“{r.theirs}”</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

