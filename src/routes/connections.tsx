import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import { LangSwitcher } from "@/components/lang-switcher";
import { ConnectionThread } from "@/components/canvas/connection-thread";
import { list, rehydrate, subscribe, type Connection } from "@/lib/connections";

export const Route = createFileRoute("/connections")({
  component: ConnectionsPage,
  head: () => ({
    meta: [
      { title: "Connections — Kindred" },
      { name: "description", content: "People you've both said hello to." },
    ],
  }),
});

function ConnectionsPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [items, setItems] = useState<Connection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    rehydrate();
    const update = () => setItems(list());
    update();
    const unsub = subscribe(update);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (!activeId && items.length > 0) {
      const firstConnected = items.find((c) => c.status === "connected");
      if (firstConnected) setActiveId(firstConnected.personId);
    }
  }, [items, activeId]);

  const connected = items.filter((c) => c.status === "connected");
  const waiting = items.filter((c) => c.status === "waiting");

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

          {connected.length > 0 && (
            <Section label={t("connection.section_connected")}>
              {connected.map((c) => (
                <Row key={c.personId} conn={c} lang={lang} active={c.personId === activeId} onSelect={() => setActiveId(c.personId)} />
              ))}
            </Section>
          )}
          {waiting.length > 0 && (
            <Section label={t("connection.section_waiting")}>
              {waiting.map((c) => (
                <Row key={c.personId} conn={c} lang={lang} active={false} muted onSelect={() => { /* nothing to open */ }} />
              ))}
            </Section>
          )}
        </aside>

        <section className="min-h-0 bg-secondary/30 hidden lg:block">
          {activeId ? (
            <ConnectionThread personId={activeId} />
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="px-5 pb-2 text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">{label}</div>
      <ul>{children}</ul>
    </div>
  );
}

function Row({ conn, lang, active, muted, onSelect }: {
  conn: Connection; lang: Lang; active: boolean; muted?: boolean; onSelect: () => void;
}) {
  const person = getPersonById(conn.personId);
  if (!person) return null;
  const loc = localized(person, lang);
  const last = conn.messages[conn.messages.length - 1];
  return (
    <li>
      <button
        onClick={onSelect}
        disabled={muted}
        className={[
          "w-full text-left px-5 py-3 flex items-center gap-3 border-l-2 transition-colors",
          active ? "border-foreground bg-secondary/50" : "border-transparent hover:bg-secondary/40",
          muted ? "opacity-60 cursor-default" : "",
        ].join(" ")}
      >
        <img src={muted ? "" : avatarUrl(person.id)} alt="" className="w-9 h-9 rounded-full border border-border bg-secondary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground truncate">
            {muted ? "—" : loc.name}
          </div>
          <div className="text-[11.5px] text-muted-foreground truncate">
            {muted ? loc.city : (last?.text ?? loc.occupation)}
          </div>
        </div>
      </button>
    </li>
  );
}
