import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { get, markSeen, send, subscribe, type Connection } from "@/lib/connections";

interface Props { personId: string; }

export function ConnectionThread({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [conn, setConn] = useState<Connection | null>(() => get(personId));
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribe(() => setConn(get(personId)));
    setConn(get(personId));
    markSeen(personId);
    return () => { unsub(); };
  }, [personId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conn?.messages.length]);

  const person = getPersonById(personId);
  if (!person || !conn || conn.status !== "connected") return null;
  const loc = localized(person, lang);

  function submit() {
    const v = text.trim();
    if (!v) return;
    send(personId, v);
    setText("");
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <img src={avatarUrl(person.id)} alt={loc.name} className="w-9 h-9 rounded-full border border-border" />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-foreground truncate">{loc.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{loc.occupation} · {loc.city}</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <ul className="space-y-2.5 max-w-md mx-auto">
          {conn.messages.map((m) => (
            <li key={m.id} className={m.from === "me" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.from === "me"
                    ? "max-w-[80%] rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-[14px] leading-relaxed"
                    : "max-w-[80%] rounded-2xl rounded-bl-md bg-secondary text-foreground px-3.5 py-2 text-[14px] leading-relaxed"
                }
              >
                {m.text}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-md mx-auto relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder={t("connection.composer_placeholder")}
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Send"
            className="absolute right-2 bottom-1.5 w-8 h-8 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-25 hover:opacity-90 transition-opacity"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
