import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import {
  pickReflectionFor,
  reflectionQuestionText,
  type MatchmakerState,
} from "@/lib/agents/matchmaker";
import { get, sayHello, subscribe, type Connection } from "@/lib/connections";

interface Props {
  state: MatchmakerState;
  onAnotherAngle: () => void;
  onAnotherPerson: () => void;
  onPass: () => void;
}

export function IntroCanvas({ state, onAnotherAngle, onAnotherPerson, onPass }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const person = state.currentPersonId ? getPersonById(state.currentPersonId) : null;
  const [conn, setConn] = useState<Connection | null>(
    person ? get(person.id) : null,
  );

  useEffect(() => {
    setConn(person ? get(person.id) : null);
    const unsub = subscribe(() => setConn(person ? get(person.id) : null));
    return () => { unsub(); };
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

  const angle = person.angles.find((a) => a.id === state.currentAngleId) ?? person.angles[0];
  const loc = localized(person, lang);
  const angleText = lang === "zh-CN" ? angle.text_zh : angle.text;
  const reflection = pickReflectionFor(person, state.understanding, lang);
  const reflectionQ = reflection ? reflectionQuestionText(reflection, lang) : "";
  const reflectionA = reflection ? (lang === "zh-CN" ? reflection.answer_zh : reflection.answer) : "";

  function handleHello() {
    sayHello(person!.id);
  }

  return (
    <div className="h-full px-8 py-10">
      <div className="mx-auto max-w-md">
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

        <div className="mt-7">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
            {t("intro.angle_label")} {loc.name}
          </div>
          <p
            key={`${person.id}:${angle.id}`}
            className="text-[15px] leading-[1.7] text-foreground animate-in fade-in duration-500"
          >
            {angleText}
          </p>
        </div>

        <p className="mt-5 text-[12px] text-muted-foreground leading-relaxed border-l border-border pl-3">
          {loc.portrait}
        </p>

        {reflection && reflectionA && (
          <div className="mt-7">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("intro.in_their_words")}
            </div>
            {reflectionQ && (
              <p className="text-[12px] text-muted-foreground italic leading-snug mb-1.5">
                {reflectionQ}
              </p>
            )}
            <p className="text-[14px] leading-[1.65] text-foreground/90">
              "{reflectionA}"
            </p>
          </div>
        )}

        {/* Secondary: explore this person further */}
        <div className="mt-7 flex flex-wrap gap-2">
          <button
            onClick={onAnotherAngle}
            className="px-3 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("intro.tell_more")}
          </button>
          <button
            onClick={onAnotherPerson}
            className="px-3 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("intro.another_person")}
          </button>
        </div>

        {/* Primary closed-loop action */}
        <div className="mt-5 pt-5 border-t border-border">
          {!conn && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleHello}
                className="px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
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

          {conn?.status === "waiting" && (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-[12.5px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                {t("connection.waiting")}
              </div>
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
    </div>
  );
}
