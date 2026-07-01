import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { MatchmakerState } from "@/lib/agents/matchmaker";
import { get, sayHello, subscribe, type Connection } from "@/lib/connections";
import { HelloComposer } from "@/components/hello-composer";
import { isProfileComplete, loadProfile } from "@/lib/profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  state: MatchmakerState;
  onAnotherPerson: () => void;
  onPass: () => void;
}

export function IntroCanvas({ state, onAnotherPerson, onPass }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const person = state.currentPersonId ? getPersonById(state.currentPersonId) : null;
  const [conn, setConn] = useState<Connection | null>(
    person ? get(person.id) : null,
  );
  const [composing, setComposing] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    setConn(person ? get(person.id) : null);
    setComposing(false);
    const unsub = subscribe(() => setConn(person ? get(person.id) : null));
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

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
  const profile = loadProfile();
  const userHasMoments = profile.moments.filter((m) => m.answer.trim().length > 0).length > 0;
  const work = person.oneWork;

  function handleHello(quotedMomentId: string, reply: string) {
    sayHello(person!.id, { quotedMomentId, reply });
    setComposing(false);
  }

  function requestSayHello() {
    if (!isProfileComplete(loadProfile())) {
      setGateOpen(true);
      return;
    }
    setComposing(true);
  }

  return (
    <div className="h-full px-8 py-10">
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

        {/* Moments */}
        <div className="mt-7 space-y-4">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("moment.about_them", { name: loc.name })}
          </div>
          {moments.length === 0 && (
            <p className="text-[13px] text-muted-foreground italic">{loc.portrait}</p>
          )}
          {moments.map((m) => {
            const prompt = getMomentPromptById(m.promptId);
            return (
              <article key={m.id} className="border-l-2 border-border pl-3">
                {prompt && (
                  <div className="text-[11px] text-muted-foreground italic leading-snug mb-1">
                    {localizedMomentPrompt(prompt, lang)}
                  </div>
                )}
                <p className="text-[14.5px] leading-[1.65] text-foreground">
                  {lang === "zh-CN" ? m.answer_zh : m.answer}
                </p>
              </article>
            );
          })}
        </div>

        {/* One Work — a single thing this person cares about */}
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

        {/* Secondary */}
        {!composing && !conn && (
          <div className="mt-7 flex flex-wrap gap-2">
            <button
              onClick={onAnotherPerson}
              className="px-3 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("intro.another_person")}
            </button>
          </div>
        )}

        {/* Primary closed-loop action */}
        <div className="mt-5 pt-5 border-t border-border">
          {!conn && !composing && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={requestSayHello}
                disabled={moments.length === 0}
                className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {t("connection.say_hello")}
              </button>
              <button
                onClick={onPass}
                className="px-3 py-2 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("connection.pass")}
              </button>
              <p className="basis-full text-[11.5px] text-muted-foreground leading-snug">
                {t("connection.hello_hint")}
              </p>
            </div>
          )}

          {!conn && composing && (
            <>
              {!userHasMoments && (
                <p className="mb-3 text-[12px] text-muted-foreground leading-snug border-l-2 border-border pl-3">
                  {t("moment.need_user_moments")}
                </p>
              )}
              <HelloComposer
                moments={moments}
                lang={lang}
                onSubmit={handleHello}
                onCancel={() => setComposing(false)}
              />
            </>
          )}

          {conn?.status === "waiting" && (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-[12.5px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                {t("connection.waiting")}
              </div>
              <YourHelloRecap conn={conn} person={person} lang={lang} />
            </div>
          )}

          {conn?.status === "connected" && (
            <div className="flex items-center gap-3">
              <Link
                to="/connections"
                className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                {t("connection.open_conversation")}
              </Link>
              <span className="text-[12px] text-muted-foreground">{t("connection.connected_note")}</span>
            </div>
          )}
        </div>
      </div>

      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold">{t("hello.gate.title")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              {t("hello.gate.body")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => setGateOpen(false)}
              className="px-3 py-1.5 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("hello.gate.later")}
            </button>
            <button
              onClick={() => {
                setGateOpen(false);
                void navigate({ to: "/profile", search: { return: "/matchmaker" } });
              }}
              className="px-4 py-1.5 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:opacity-90 transition-opacity"
            >
              {t("hello.gate.cta")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YourHelloRecap({
  conn, person, lang,
}: { conn: Connection; person: ReturnType<typeof getPersonById>; lang: Lang }) {
  const { t } = useTranslation();
  if (!person) return null;
  const m = person.moments.find((mm) => mm.id === conn.fromMe.quotedMomentId);
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
      <p className="text-[13px] text-foreground leading-snug">"{conn.fromMe.reply}"</p>
    </div>
  );
}
