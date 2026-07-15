// ActiveWishBanner — the home page's "state center" card.
//
// Reads the most recent non-revoked do_something session and shows:
//   - nothing, if there's no live wish
//   - a "waiting" card, if the wish is published but has no match
//   - a "matched" card, if someone lined up
//   - a "chat" card, if the user is mid-conversation
//
// The banner is why the user can close the tab and come back: the home
// page tells them, at a glance, what's going on right now.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowRight, Clock, Sparkles, MessageCircle } from "lucide-react";
import {
  revokeAndReset,
  currentView,
  type SideState,
} from "@/lib/agents/side-by-side";
import { mostRecentActiveDoSomething, updateSession, deriveDoSomethingStatus, revokeSession } from "@/lib/sessions";
import { findMatch, findNearMisses, getIntentById } from "@/lib/intents";
import { getPersonById } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

function relTime(ts: number, t: TFunction): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("home.time.just_now");
  if (mins < 60) return t("home.time.minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("home.time.hours", { n: hours });
  const days = Math.floor(hours / 24);
  return t("home.time.days", { n: days });
}

function summarize(intentId: string | null, t: TFunction): string {
  if (!intentId) return "";
  const it = getIntentById(intentId);
  if (!it) return "";
  const kindLabel = t(`activity.kind.${it.kind}`);
  const parts: string[] = [kindLabel];
  if (!it.whenAny) {
    const when = (it.day === "sat" || it.day === "sun") ? "weekend"
      : it.window === "evening" ? "weeknight" : "any";
    parts.push(t(`meet.when.${when}`));
  }
  if (!it.levelAny && (it.kind === "tennis" || it.kind === "climb")) {
    parts.push(t(`meet.level.${it.level}`));
  }
  return parts.join(" · ");
}

export function ActiveWishBanner() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [state, setState] = useState<SideState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Read the most recent non-revoked do_something session.
    const active = mostRecentActiveDoSomething();
    if (!active) { setState(null); return; }
    setSessionId(active.id);
    const s = active.state as SideState;
    // Try one more match on mount — the demo way to simulate "while you
    // were away, someone showed up".
    if (s.stage === "published" && s.myIntentId && !s.matchIntentId) {
      const mine = getIntentById(s.myIntentId);
      if (mine) {
        const hit = findMatch(mine, { exclude: s.triedIntentIds });
        if (hit) {
          const next: SideState = { ...s, matchIntentId: hit.id, nearMissIds: [] };
          updateSession(active.id, { state: next, status: deriveDoSomethingStatus(next) });
          setState(next);
          return;
        }
        const nears = findNearMisses(mine, { exclude: s.triedIntentIds });
        const next: SideState = { ...s, nearMissIds: nears.map((n) => n.id) };
        updateSession(active.id, { state: next, status: deriveDoSomethingStatus(next) });
        setState(next);
        return;
      }
    }
    setState(s);
  }, []);

  if (!state) return null;
  const view = currentView(state);
  if (view === "empty") return null;

  const linkSearch = sessionId ? { session: sessionId } : undefined;

  const summary = summarize(state.myIntentId, t);

  // --- Match state ------------------------------------------------------
  if (view === "match" && state.matchIntentId) {
    const other = getIntentById(state.matchIntentId);
    const person = other ? getPersonById(other.ownerId) : null;
    const name = person ? (lang === "zh-CN" ? person.name_zh : person.name) : "";
    return (
      <Link
        to="/side-by-side"
        search={linkSearch}
        className="group block mb-6 rounded-2xl border border-foreground/40 bg-foreground/[0.03] px-5 py-4 hover:border-foreground/70 hover:bg-foreground/[0.06] transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-foreground text-background grid place-items-center">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              {t("home.banner.matched_title")}
            </div>
            <div className="mt-0.5 text-[12.5px] text-foreground/75 truncate">
              {t("home.banner.matched_body", { name, summary })}
            </div>
          </div>
          <div className="shrink-0 self-center inline-flex items-center gap-1 text-[12px] font-medium text-foreground">
            {t("home.banner.matched_cta")}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          </div>
        </div>
      </Link>
    );
  }

  // --- Chat state -------------------------------------------------------
  if (view === "chat" && state.matchIntentId) {
    const other = getIntentById(state.matchIntentId);
    const person = other ? getPersonById(other.ownerId) : null;
    const name = person ? (lang === "zh-CN" ? person.name_zh : person.name) : "";
    return (
      <Link
        to="/side-by-side"
        search={linkSearch}
        className="group block mb-6 rounded-2xl border border-border bg-card px-5 py-4 hover:border-foreground/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-secondary text-foreground grid place-items-center">
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              {t("home.banner.chat_title", { name })}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground truncate">
              {t("home.banner.chat_body", { summary })}
            </div>
          </div>
          <div className="shrink-0 self-center inline-flex items-center gap-1 text-[12px] font-medium text-foreground/80">
            {t("home.banner.chat_cta")}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          </div>
        </div>
      </Link>
    );
  }

  // --- Waiting state ----------------------------------------------------
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  const ago = mine ? relTime(mine.createdAt, t) : "";

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = revokeAndReset(state!);
    if (sessionId) revokeSession(sessionId);
    setState(next);
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-secondary text-foreground/70 grid place-items-center">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground">
            {t("home.banner.waiting_title")}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground truncate">
            {t("home.banner.waiting_body", { summary, ago })}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground/80">
            {t("home.banner.waiting_hint")}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="text-[12px] px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {t("home.banner.cancel")}
        </button>
        <Link
          to="/side-by-side"
          className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
        >
          {t("home.banner.waiting_cta")}
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
