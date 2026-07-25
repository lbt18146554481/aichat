import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRequireAuth } from "@/lib/auth-guard";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import { LangSwitcher } from "@/components/lang-switcher";
import { ConnectionThread } from "@/components/canvas/connection-thread";
import { hasUnseenFor, list, rehydrate, subscribe, type Connection } from "@/lib/connections";

const LAST_ACTIVE_KEY = "kindred:connections:last";

export const Route = createFileRoute("/connections")({
  validateSearch: (raw: Record<string, unknown>): { open?: string } => {
    const v = raw?.open;
    return typeof v === "string" && v.length > 0 ? { open: v } : {};
  },
  component: ConnectionsPage,
  head: () => ({
    meta: [
      { title: "Conversations — Kindred" },
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const consumedOpenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    rehydrate();
    const update = () => setItems(list().sort((a, b) => activityAt(b) - activityAt(a)));
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
    if (restoredRef.current || items.length === 0 || open) return;
    restoredRef.current = true;
    try {
      const saved = window.sessionStorage.getItem(LAST_ACTIVE_KEY);
      if (saved && items.find((c) => c.personId === saved)) setActiveId(saved);
    } catch { /* noop */ }
  }, [items, open]);

  useEffect(() => {
    if (!activeId) return;
    try { window.sessionStorage.setItem(LAST_ACTIVE_KEY, activeId); } catch { /* noop */ }
  }, [activeId]);

  useEffect(() => {
    if (activeId) {
      if (!items.find((c) => c.personId === activeId)) setActiveId(null);
      return;
    }
    if (items.length > 0) setActiveId(items[0].personId);
  }, [items, activeId]);

  if (!ready) return <div className="min-h-screen bg-background" />;

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">Kindred</span>
          </Link>
          <div className="text-[13.5px] font-semibold tracking-tight">{t("connection.title")}</div>
          <LangSwitcher />
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] min-h-0">
        <aside className="border-r border-border overflow-y-auto">
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

        <section className="min-h-0 bg-secondary/30 hidden lg:block">
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
  let tail = "";
  const dim = conn.status === "faded";
  if (last) {
    subtitle = last.text;
  } else if (conn.status === "incoming" && conn.fromThem) {
    subtitle = conn.fromThem.reply;
  } else if (conn.status === "sent" && conn.fromMe) {
    subtitle = conn.fromMe.reply;
    tail = t("connection.waiting_tail");
  } else if (conn.status === "connected" && conn.fromThem) {
    subtitle = conn.fromThem.reply;
  } else if (conn.status === "faded") {
    subtitle = t("connection.faded_subtitle");
  } else {
    subtitle = loc.occupation;
  }

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
          {dot && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-foreground ring-2 ring-background" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-foreground truncate">{loc.name}</div>
          <div className="text-[12px] text-muted-foreground truncate">
            {subtitle}
            {tail && <span className="ml-1 text-muted-foreground/70">· {tail}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}
