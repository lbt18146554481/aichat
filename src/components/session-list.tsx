import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Users, UserSearch, MessageSquare, Trash2 } from "lucide-react";
import { useSessions } from "@/data/hooks";
import { clearActiveThreadId, getActiveThreadId } from "@/lib/active-thread";
import { deleteSession, type Session } from "@/lib/sessions";
import { sessionAgentLabel, sessionExitLabel } from "@/lib/session-display";

interface Props {
  limit?: number;
  showViewAll?: boolean;
  embedded?: boolean;
}

function relTime(ts: number, t: (key: string, opts?: object) => string): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("home.time.just_now");
  if (mins < 60) return t("home.time.minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("home.time.hours", { n: hours });
  const days = Math.floor(hours / 24);
  return t("home.time.days", { n: days });
}

export function SessionList({ limit, showViewAll = false, embedded = false }: Props) {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useSessions();

  function handleDelete(session: Session, e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const label = session.seed?.trim() || t("sessions.untitled");
    if (!window.confirm(t("history.delete_confirm", { title: label }))) return;
    if (getActiveThreadId() === session.threadId) clearActiveThreadId();
    deleteSession(session.id);
  }

  if (isLoading && rows.length === 0) return null;

  if (rows.length === 0) {
    if (!embedded) return null;
    return (
      <p className="text-[12.5px] text-muted-foreground py-6 text-center">{t("history.empty")}</p>
    );
  }

  const shown = limit ? rows.slice(0, limit) : rows;
  const hasMore = limit ? rows.length > limit : false;

  const listEl = (
    <ul
      className={
        embedded
          ? "divide-y divide-border/60"
          : "divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden"
      }
    >
      {shown.map((s: Session) => {
        const Icon =
          s.agent === "do_something" ? Users : s.agent === "introduce" ? UserSearch : MessageSquare;
        const to =
          s.agent === "do_something"
            ? "/side-by-side"
            : s.agent === "introduce"
              ? "/matchmaker"
              : "/";
        const search =
          s.agent === "reception"
            ? { thread: s.threadId }
            : s.agent === "do_something"
              ? { session: s.id, chatWith: "" }
              : { session: s.id };
        return (
          <li key={s.id} className="flex items-stretch">
            <Link
              to={to}
              search={search}
              className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
            >
              <div className="shrink-0 w-7 h-7 rounded-full bg-secondary text-foreground/70 grid place-items-center">
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-foreground truncate">
                  {s.seed || t("sessions.untitled")}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
                  <span className="shrink-0 rounded-full bg-secondary/80 px-1.5 py-px text-[10.5px] font-medium text-foreground/70">
                    {sessionAgentLabel(s.agent, t)}
                  </span>
                  <span className="truncate">{sessionExitLabel(s, t)}</span>
                  <span className="text-border/80">·</span>
                  <span className="shrink-0">{relTime(s.updatedAt, t)}</span>
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={(e) => handleDelete(s, e)}
              className="shrink-0 px-3 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5 transition-colors"
              aria-label={t("history.delete")}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (embedded) return listEl;

  return (
    <section className="mt-10 mb-4">
      {showViewAll && hasMore && (
        <div className="flex items-baseline justify-end mb-3 px-1">
          <Link
            to="/sessions"
            className="text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("sessions.view_all", { n: rows.length })}
          </Link>
        </div>
      )}
      {listEl}
    </section>
  );
}
