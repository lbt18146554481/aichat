import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { avatarUrl, isAiSeedPerson, localized } from "@/lib/people";
import { usePerson } from "@/data/hooks";
import { pickLocaleText, normalizeLang, type AppLang } from "@/lib/lang";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { MatchmakerState } from "@/lib/agents/matchmaker";
import { get, sayHello } from "@/lib/connections";
import type { Connection } from "@/lib/connection-types";
import { useConnections, useProfile, useSavedPeople } from "@/data/hooks";
import { HelloComposer } from "@/components/hello-composer";
import { isVitalsComplete } from "@/lib/profile";
import { setFocusPerson } from "@/lib/seed";
import { buildReasons, type Reason } from "@/lib/match-reasons";
import type { UserUnderstanding } from "@/lib/understanding";
import type { Person } from "@/lib/types";
import {
  isPersonSaved,
  removeSavedPerson,
  savePerson,
} from "@/lib/saved-people";
import { PublicProfileSheet } from "@/components/public-profile-sheet";
import { PersonPublicDetail } from "@/components/person-public-detail";
import { AiPersonaBadge } from "@/components/ai-persona-badge";
import { CanvasSwapShell } from "@/components/canvas/canvas-swap-shell";
import { BookmarkPlus, BookmarkCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

interface Props {
  state: MatchmakerState;
  sessionId: string;
  canGoPrev?: boolean;
  /** Explicit reject — adds to passedIds. */
  onRejectPerson: () => void;
  /** Browse next in queue without rejecting. */
  onSeeNextPerson: () => void;
  /** Step back to a previously browsed person. */
  onSeePrevPerson: () => void;
}

// Per-person composer draft — survives a jump to /profile and back so the
// user never loses the reply they were writing.
interface IntroDraft {
  composing: boolean;
  picked: string | null;
  reply: string;
}
const draftKey = (personId: string) => `kindred:intro:draft:${personId}`;
function loadDraft(personId: string): IntroDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(personId));
    return raw ? (JSON.parse(raw) as IntroDraft) : null;
  } catch {
    return null;
  }
}
function saveDraft(personId: string, d: IntroDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(draftKey(personId), JSON.stringify(d));
  } catch {
    /* noop */
  }
}
function clearDraft(personId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(draftKey(personId));
  } catch {
    /* noop */
  }
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
  try {
    return window.sessionStorage.getItem(RESUME_KEY);
  } catch {
    return null;
  }
}
function clearResumeHello() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* noop */
  }
}

export function IntroCanvas({
  state,
  sessionId,
  canGoPrev = false,
  onRejectPerson,
  onSeeNextPerson,
  onSeePrevPerson,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const navigate = useNavigate();
  const person = usePerson(state.currentPersonId);
  const { data: connections = [] } = useConnections();
  const { data: savedPeople = [] } = useSavedPeople();
  const { data: myProfile } = useProfile();
  const conn = useMemo(
    () => (person ? connections.find((c) => c.personId === person.id) ?? get(person.id) : null),
    [connections, person?.id],
  );
  const saved = person ? savedPeople.some((p) => p.personId === person.id) : false;
  const [composing, setComposing] = useState(false);
  const [draftPicked, setDraftPicked] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helloSending, setHelloSending] = useState(false);
  const swapToken = `${person?.id ?? ""}:${state.canvasSwapKey ?? 0}`;

  useEffect(() => {
    setDetailsOpen(false);
  }, [swapToken]);

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

  // Auto-remove saved once a real connection begins — Save is pre-decision only.
  useEffect(() => {
    if (person && conn && conn.status !== "faded" && isPersonSaved(person.id)) {
      removeSavedPerson(person.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, conn?.status]);

  useEffect(() => {
    if (!person) return;
    const resumeId = readResumeHello();
    const resuming = resumeId !== null && isVitalsComplete(myProfile);
    const d =
      loadDraft(person.id) ?? (resuming && resumeId !== person.id ? loadDraft(resumeId!) : null);
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
    // Only restore draft when switching to a different person — not on every profile cache tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  useEffect(() => {
    if (!person || restoredRef.current !== person.id) return;
    const resumeId = readResumeHello();
    if (!resumeId || !isVitalsComplete(myProfile)) return;
    setComposing(true);
    const d = loadDraft(person.id) ?? loadDraft(resumeId);
    if (d) {
      setDraftPicked(d.picked);
      setDraftReply(d.reply);
    }
  }, [person?.id, myProfile]);

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
            requestAnimationFrame(() => {
              el.scrollTo({ top });
            });
          });
        }
      } catch {
        /* noop */
      }
    }
    const onScroll = () => {
      try {
        window.sessionStorage.setItem(scrollKey(person.id), String(el.scrollTop));
      } catch {
        /* noop */
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, conn?.status]);

  if (!person) {
    return (
      <div className="h-full grid place-items-center px-8 py-12">
        <div className="max-w-sm text-center">
          <div className="w-10 h-10 mx-auto rounded-full border border-dashed border-border" />
          <h2 className="mt-5 text-[15px] font-medium text-foreground">{t("intro.empty_title")}</h2>
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
    const p = myProfile;
    if (!isVitalsComplete(p)) {
      const nextDraft = {
        composing: true,
        picked: opts?.pickedMomentId ?? draftPicked,
        reply: opts?.draftReply ?? draftReply,
      };
      saveDraft(personId, nextDraft);
      try {
        const url = window.location.pathname + window.location.search;
        window.sessionStorage.setItem("kindred:profile:return", url);
        window.sessionStorage.setItem(RESUME_KEY, personId);
        // Come back to this exact person, not whoever ranks first after the
        // profile changed.
        setFocusPerson(personId);
        const el = getScrollParent();
        if (el) window.sessionStorage.setItem(scrollKey(personId), String(el.scrollTop));
      } catch {
        /* noop */
      }
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
    if (!person || helloSending) return;
    setHelloSending(true);
    void sayHello(person.id, { quotedMomentId, reply }, sessionId)
      .finally(() => setHelloSending(false));
    clearResumeHello();
    setComposing(false);
    setDraftPicked(null);
    setDraftReply("");
    clearDraft(person.id);
    savedScrollRef.current = null;
  }

  function handleCancel() {
    clearResumeHello();
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

  const reasons =
    person && myProfile ? buildReasons(person, myProfile, state.understanding, lang) : [];

  function renderMoment(
    m: Person["moments"][number],
    opts: { clickable: boolean; mode: "select" | "quoteAndCompose" },
  ) {
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
          {pickLocaleText(lang, m.answer, m.answer_zh)}
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
    <>
      <CanvasSwapShell
        swapToken={swapToken}
        queueCursor={state.queueCursor}
        className="h-full"
      >
        <div
          ref={rootRef}
          className="h-full px-6 sm:px-8 pt-8 sm:pt-10 pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
      <div className="mx-auto max-w-lg">
        {/* Identity + match reasons */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label={t("intro.view_profile_of", { name: loc.name })}
            className="group inline-flex flex-col items-center rounded-lg px-2 py-1 hover:bg-secondary/60 transition-colors"
          >
            <img
              src={avatarUrl(person.id)}
              alt={loc.name}
              className="w-20 h-20 rounded-full border border-border bg-secondary"
            />
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <h2 className="text-[19px] font-semibold tracking-tight text-foreground">
                {loc.name}
              </h2>
              {isAiSeedPerson(personId) && <AiPersonaBadge />}
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {personIdentitySubtitle(person, lang, t)}
            </p>
          </button>

          {!composing && myProfile && reasons.length > 0 && (
            <MatchReasonsBelowAvatar lang={lang} reasons={reasons} name={loc.name} />
          )}
        </div>

        {/* One Moment — for hello compose flow only */}
        {moments.length > 0 && composing && (
          <div className="mt-5 space-y-4">
            {composing && (
              <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                {t("moment.compose_hint")}
              </div>
            )}
            {composing
              ? moments.map((m) => renderMoment(m, { clickable: true, mode: "select" }))
              : null}
          </div>
        )}

        <div className="relative mt-8">
          {!composing && (
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-border bg-background text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shadow-sm"
              >
                {detailsOpen ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    {t("intro.collapse_details")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    {t("intro.expand_details")}
                  </>
                )}
              </button>
            </div>
          )}

          <div className="border-t border-border pt-6">
            {detailsOpen && !composing && (
              <PersonPublicDetail person={person} lang={lang} />
            )}

            {/* Primary closed-loop actions */}
            {!conn && !composing && (
              <div className={detailsOpen ? "mt-6" : ""}>
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    onClick={() => requestSayHello()}
                    disabled={helloSending}
                    className="shrink-0 inline-flex items-center justify-center min-h-10 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
                      "shrink-0 inline-flex items-center justify-center gap-1.5 min-h-10 px-4 rounded-md border text-[13px] font-medium transition-colors",
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
                    type="button"
                    onClick={onRejectPerson}
                    className="shrink-0 inline-flex items-center justify-center min-h-10 px-3 rounded-md border border-red-500/45 text-[13px] font-medium text-red-600 hover:text-red-700 hover:bg-red-500/10 transition-colors"
                  >
                    {t("intro.unfollow")}
                  </button>
                  <button
                    type="button"
                    onClick={onSeePrevPerson}
                    disabled={!canGoPrev}
                    className="shrink-0 inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {t("intro.browse_prev")}
                  </button>
                  <button
                    onClick={onSeeNextPerson}
                    className="shrink-0 inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {t("intro.browse_next")}
                    <ChevronRight className="w-3.5 h-3.5" />
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

          {helloSending && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-[12.5px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
              {t("persona.hello_sending")}
            </div>
          )}

          {conn?.status === "sent" && !helloSending && (
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
              <span className="block text-[12px] text-muted-foreground">
                {isAiSeedPerson(personId) ? t("persona.connected_note") : t("connection.connected_note")}
              </span>
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
        </div>
        </div>
      </CanvasSwapShell>
      <PublicProfileSheet person={person} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}

function YourHelloRecap({
  fromMe,
  person,
  lang,
}: {
  fromMe: NonNullable<Connection["fromMe"]>;
  person: Person;
  lang: AppLang;
}) {
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

// ---- Match reasons (compact, below avatar) ------------------------------

function personIdentitySubtitle(
  person: Person,
  lang: AppLang,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const loc = localized(person, lang);
  const gender = t(`profile.gender.${person.gender}`);
  const age = lang === "zh-CN" ? `${person.age}岁` : String(person.age);
  return [gender, age, loc.city, loc.occupation].join(" · ");
}

function MatchReasonsBelowAvatar({
  lang,
  reasons,
  name,
}: {
  lang: AppLang;
  reasons: Reason[];
  name: string;
}) {
  const { t } = useTranslation();

  function reasonText(r: Reason): string {
    if (r.kind === "favorite") return t("why.same_favorite", { title: r.title });
    if (r.kind === "values") return t("why.lead_values", { name });
    return r.category === "values"
      ? t("why.lead_values", { name })
      : t("why.lead_lifestyle", { name });
  }

  const lines: string[] = [];
  for (const r of reasons) {
    const text = reasonText(r);
    if (!lines.includes(text)) lines.push(text);
  }
  if (lines.length === 0) return null;

  return (
    <div className="mt-4 text-center rounded-xl border border-border bg-secondary/35 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
        {t("why.title", { name })}
      </div>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-foreground">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Why this person (legacy export kept for tests if any) ----------------
