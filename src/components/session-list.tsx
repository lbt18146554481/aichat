// SessionList — the "everything you've said" list on the home page.
//
// One row per session, sorted by updatedAt desc. Clicking a row jumps
// straight back to that session's detail page (side-by-side or matchmaker),
// which loads the exact state as it was left.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Users, UserSearch } from "lucide-react";
import { listSessions, type Session, type SessionStatus } from "@/lib/sessions";

interface Props {
  limit?: number;
  /** When true, show a "view all" link that leads to /sessions. */
  showViewAll?: boolean;
}

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

function statusChip(status: SessionStatus, t: TFunction) {
  const map: Record<SessionStatus, { key: string; tone: string }> = {
    waiting:  { key: "sessions.status_waiting",  tone: "bg-secondary text-foreground/70" },
    matched:  { key: "sessions.status_matched",  tone: "bg-foreground text-background" },
    chatting: { key: "sessions.status_chatting", tone: "bg-foreground/10 text-foreground" },
    revoked:  { key: "sessions.status_revoked",  tone: "bg-transparent text-muted-foreground/70 border border-border" },
  };
  const c = map[status];
  return (
    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium ${c.tone}`}>
      {t(c.key)}
    </span>
  );
}

export function SessionList({ limit, showViewAll = false }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Session[] | null>(null);

  useEffect(() => {
    setRows(listSessions());
  }, []);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  const shown = limit ? rows.slice(0, limit) : rows;
  const hasMore = limit ? rows.length > limit : false;

  return (
    <section className="mt-10 mb-4">
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="text-[11.5px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
          {t("sessions.title")}
        </h2>
        {(showViewAll && hasMore) && (
          <Link
            to="/sessions"
            className="text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("sessions.view_all", { n: rows.length })}
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
        {shown.map((s) => {
          const Icon = s.agent === "do_something" ? Users : UserSearch;
          const to = s.agent === "do_something" ? "/side-by-side" : "/matchmaker";
          const search = s.agent === "do_something" ? { session: s.id } : undefined;
          return (
            <li key={s.id}>
              <Link
                to={to}
                search={search}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
              >
                <div className="shrink-0 w-7 h-7 rounded-full bg-secondary text-foreground/70 grid place-items-center">
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-foreground truncate">
                    {s.seed || t("sessions.untitled")}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {relTime(s.updatedAt, t)}
                  </div>
                </div>
                {statusChip(s.status, t)}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
