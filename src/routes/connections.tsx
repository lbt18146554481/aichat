import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import { LangSwitcher } from "@/components/lang-switcher";
import { ConnectionThread } from "@/components/canvas/connection-thread";
import { hasUnseenFor, list, rehydrate, subscribe, type Connection } from "@/lib/connections";
import { useIsMobile } from "@/hooks/use-mobile";

const LAST_ACTIVE_KEY = "kindred:connections:last";

export const Route = createFileRoute("/connections")({
  validateSearch: (raw: Record<string, unknown>): { open?: string } => {
    const v = raw?.open;
    return typeof v === "string" && v.length > 0 ? { open: v } : {};
  },
  component: ConnectionsPage,
  head: () => ({
    meta: [
      { title: "Conversations — Maitri" },
      { name: "description", content: "Your ongoing conversations." },
    ],
  }),
});

/** Newest activity — last message, else connected time, else hello time. */
function activityAt(c: Connection): number {
  const last = c.messages[c.messages.length - 1];
  return Math.max(last?.t ?? 0, c.connectedAt ?? 0, c.helloAt);
}

function ConnectionsPage() {
  const { ready } = useRequireAuth();
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const { open } = Route.useSearch();
  const [items, setItems] = useState<Connection[]>([]);
  // `loaded` separates "still reading local storage" from "genuinely empty",
  // so the list can show skeletons first and the empty state only once.
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const consumedOpenRef = useRef<string | null>(null);
  // Phones use master → detail navigation: the list is the landing surface and
  // a thread only opens on tap. Auto-selecting the first row here is what made
  // the back button look broken (it closed, then instantly reopened).
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!ready) return;
    rehydrate();
    const update = () => {
      setItems(list().sort((a, b) => activityAt(b) - activityAt(a)));
      setLoaded(true);
    };
    update();
    const unsub = subscribe(update);
    return () => { unsub(); };
  }, [ready]);


  useEffect(() => {
    if (!open || consumedOpenRef.current === open) return;
    if (items.length === 0) return;
    const target = items.find((c) => c.personId === open);
    if (target) {
      setActiveId(open);
      consumedOpenRef.current = open;
      void navigate({ to: "/connections", search: {}, replace: true });
    }
  }, [open, items, navigate]);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || items.length === 0 || open || isMobile) return;
    restoredRef.current = true;
    try {
      const saved = window.sessionStorage.getItem(LAST_ACTIVE_KEY);
      if (saved && items.find((c) => c.personId === saved)) setActiveId(saved);
    } catch { /* noop */ }
  }, [items, open, isMobile]);

  useEffect(() => {
    if (!activeId) return;
    try { window.sessionStorage.setItem(LAST_ACTIVE_KEY, activeId); } catch { /* noop */ }
  }, [activeId]);

  useEffect(() => {
    if (activeId) {
      if (!items.find((c) => c.personId === activeId)) setActiveId(null);
      return;
    }
    if (!isMobile && items.length > 0) setActiveId(items[0].personId);
  }, [items, activeId, isMobile]);

  if (!ready) return <div className="min-h-screen bg-background" />;

  return (
    <div className="h-dvh flex flex-col bg-background pb-tabbar lg:pb-0">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30 pt-safe">
        <div className="max-w-7xl mx-auto px-4 md:px-5 h-14 flex items-center justify-between gap-3">
          {/* On mobile, when a thread is open we show a back button that
              closes the thread (returning to the list). Otherwise a Home
              link. On desktop, always Home. */}
          {activeId ? (
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="lg:hidden inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t("nav.back")}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-mono uppercase tracking-wide">{t("nav.back")}</span>
            </button>
          ) : (
            <Link to="/" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="font-mono uppercase tracking-wide">Maitri</span>
            </Link>
          )}
          {activeId && (
            <Link to="/" className="hidden lg:inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              <span className="font-mono uppercase tracking-wide">Maitri</span>
            </Link>
          )}
          <div className="text-[13.5px] font-semibold tracking-tight">{t("connection.title")}</div>
          <LangSwitcher />
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] min-h-0">
        <aside className={[
          "border-r border-border overflow-y-auto overscroll-contain-y",
          // Hide list on mobile once a thread is open.
          activeId ? "hidden lg:block" : "block",
        ].join(" ")}>
          {items.length === 0 ? (
            <p className="px-5 py-8 text-[13px] text-muted-foreground leading-relaxed">{t("connection.empty")}</p>
          ) : (
            <ul>
              {items.map((c) => (
                <Row
                  key={c.personId}
                  conn={c}
                  lang={lang}
                  active={c.personId === activeId}
                  dot={hasUnseenFor(c)}
                  onSelect={() => setActiveId(c.personId)}
                />
              ))}
            </ul>
          )}
        </aside>

        <section className={[
          "min-h-0 bg-secondary/30",
          // Show thread on mobile only if activeId is set.
          activeId ? "block" : "hidden lg:block",
        ].join(" ")}>
          {activeId ? (
            <ConnectionThread key={activeId} personId={activeId} />
          ) : (
            <div className="h-full grid place-items-center">
              <p className="text-[13px] text-muted-foreground">{t("connection.pick_one")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}


function Row({ conn, lang, active, dot, onSelect }: {
  conn: Connection; lang: Lang; active: boolean; dot?: boolean; onSelect: () => void;
}) {
  const { t } = useTranslation();
  const person = getPersonById(conn.personId);
  if (!person) return null;
  const loc = localized(person, lang);
  const last = conn.messages[conn.messages.length - 1];

  // Subtitle: latest chat message > hello quote > status fallback.
  let subtitle = "";
  const dim = conn.status === "faded";
  if (last) {
    subtitle = last.text;
  } else if (conn.status === "incoming" && conn.fromThem) {
    subtitle = conn.fromThem.reply;
  } else if (conn.status === "sent" && conn.fromMe) {
    subtitle = conn.fromMe.reply;
  } else if (conn.status === "connected" && conn.fromThem) {
    subtitle = conn.fromThem.reply;
  } else if (conn.status === "faded") {
    subtitle = t("connection.faded_subtitle");
  } else {
    subtitle = loc.occupation;
  }

  // Status pill — surfaces the variety of conversation states at a glance.
  const statusMap: Record<Connection["status"], { key: string; tone: string }> = {
    incoming:  { key: "connection.section_incoming",  tone: "bg-primary/10 text-primary border-primary/20" },
    sent:      { key: "connection.section_sent",      tone: "bg-secondary text-muted-foreground border-border" },
    connected: { key: "connection.section_connected", tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
    faded:     { key: "connection.section_faded",     tone: "bg-muted text-muted-foreground border-border" },
  };
  const pill = statusMap[conn.status];

  return (
    <li>
      <button
        onClick={onSelect}
        className={[
          "w-full text-left px-4 py-3 flex items-center gap-3 border-l-2 transition-colors",
          active ? "border-foreground bg-secondary/50" : "border-transparent hover:bg-secondary/40",
          dim ? "opacity-60" : "",
        ].join(" ")}
      >
        <div className="relative shrink-0">
          <img src={avatarUrl(person.id)} alt="" className={[
            "w-10 h-10 rounded-full border border-border bg-secondary",
            dim ? "grayscale" : "",
          ].join(" ")} />
          {dot && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[13.5px] font-medium text-foreground truncate flex-1">{loc.name}</div>
            <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wide ${pill.tone}`}>
              {t(pill.key)}
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground truncate">{subtitle}</div>
        </div>
      </button>
    </li>
  );
}

