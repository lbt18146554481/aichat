import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import { LangSwitcher } from "@/components/lang-switcher";
import { ConnectionThread } from "@/components/canvas/connection-thread";
import { IncomingHello } from "@/components/canvas/incoming-hello";
import { list, rehydrate, subscribe, type Connection } from "@/lib/connections";
import { setFocusPerson } from "@/lib/seed";

export const Route = createFileRoute("/connections")({
  component: ConnectionsPage,
  head: () => ({
    meta: [
      { title: "Connections — Kindred" },
      { name: "description", content: "People you've both said hello to." },
    ],
  }),
});

type PaneKind = "thread" | "incoming" | null;

function ConnectionsPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [items, setItems] = useState<Connection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showFaded, setShowFaded] = useState(false);

  useEffect(() => {
    rehydrate();
    const update = () => setItems(list());
    update();
    const unsub = subscribe(update);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (activeId) {
      // If the active connection was dismissed/faded, drop it.
      const active = items.find((c) => c.personId === activeId);
      if (!active || (active.status !== "connected" && active.status !== "incoming")) {
        setActiveId(null);
      }
      return;
    }
    // Auto-select an incoming first, else the first connected.
    const firstIncoming = items.find((c) => c.status === "incoming");
    if (firstIncoming) { setActiveId(firstIncoming.personId); return; }
    const firstConnected = items.find((c) => c.status === "connected");
    if (firstConnected) setActiveId(firstConnected.personId);
  }, [items, activeId]);

  const incoming = items.filter((c) => c.status === "incoming");
  const connected = items.filter((c) => c.status === "connected");
  const faded = items.filter((c) => c.status === "faded");

  const activeConn = activeId ? items.find((c) => c.personId === activeId) ?? null : null;
  const paneKind: PaneKind =
    activeConn?.status === "incoming" ? "incoming"
    : activeConn?.status === "connected" ? "thread"
    : null;

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

      <div className="flex-1 grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] min-h-0">
        <aside className="border-r border-border overflow-y-auto">
          {items.length === 0 && (
            <p className="px-5 py-8 text-[13px] text-muted-foreground leading-relaxed">{t("connection.empty")}</p>
          )}

          {incoming.length > 0 && (
            <Section label={t("connection.section_incoming")}>
              {incoming.map((c) => (
                <Row
                  key={c.personId}
                  conn={c}
                  lang={lang}
                  active={c.personId === activeId}
                  dot
                  onSelect={() => setActiveId(c.personId)}
                />
              ))}
            </Section>
          )}

          {connected.length > 0 && (
            <Section label={t("connection.section_connected")}>
              {connected.map((c) => (
                <Row
                  key={c.personId}
                  conn={c}
                  lang={lang}
                  active={c.personId === activeId}
                  onSelect={() => setActiveId(c.personId)}
                />
              ))}
            </Section>
          )}

          {faded.length > 0 && (
            <div className="py-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowFaded((v) => !v)}
                className="w-full px-5 pb-2 pt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {showFaded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span>{t("connection.section_faded")}</span>
                <span className="ml-1 tabular-nums opacity-70">{faded.length}</span>
              </button>
              {showFaded && (
                <ul>
                  {faded.map((c) => (
                    <Row
                      key={c.personId}
                      conn={c}
                      lang={lang}
                      active={false}
                      muted
                      onSelect={() => { /* nothing to open */ }}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        <section className="min-h-0 bg-secondary/30 hidden lg:block">
          {paneKind === "thread" && activeId && <ConnectionThread personId={activeId} />}
          {paneKind === "incoming" && activeId && <IncomingHello personId={activeId} />}
          {paneKind === null && (
            <div className="h-full grid place-items-center">
              <p className="text-[13px] text-muted-foreground">{t("connection.pick_one")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="px-5 pb-2 text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">{label}</div>
      <ul>{children}</ul>
    </div>
  );
}

function Row({ conn, lang, active, muted, dot, onSelect }: {
  conn: Connection; lang: Lang; active: boolean; muted?: boolean; dot?: boolean; onSelect: () => void;
}) {
  const person = getPersonById(conn.personId);
  if (!person) return null;
  const loc = localized(person, lang);
  const last = conn.messages[conn.messages.length - 1];
  const subtitle = conn.status === "incoming"
    ? loc.occupation
    : conn.status === "faded"
    ? loc.city
    : (last?.text ?? loc.occupation);
  return (
    <li>
      <button
        onClick={onSelect}
        disabled={muted}
        className={[
          "w-full text-left px-5 py-3 flex items-center gap-3 border-l-2 transition-colors",
          active ? "border-foreground bg-secondary/50" : "border-transparent hover:bg-secondary/40",
          muted ? "opacity-55 cursor-default" : "",
        ].join(" ")}
      >
        <div className="relative shrink-0">
          <img src={avatarUrl(person.id)} alt="" className="w-9 h-9 rounded-full border border-border bg-secondary" />
          {dot && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-foreground ring-2 ring-background" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground truncate">{loc.name}</div>
          <div className="text-[11.5px] text-muted-foreground truncate">{subtitle}</div>
        </div>
      </button>
    </li>
  );
}
