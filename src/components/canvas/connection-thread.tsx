import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowUp, MoreHorizontal } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import {
  dismissIncoming,
  get,
  isTyping,
  markSeen,
  removeFaded,
  respondToIncoming,
  send,
  subscribe,
  undoFadedFor,
  withdrawSent,
  type ChatMsg,
  type Connection,
} from "@/lib/connections";
import { PublicProfileSheet } from "@/components/public-profile-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { setFocusPerson } from "@/lib/seed";

interface Props { personId: string; }

interface Bubble {
  id: string;
  from: "me" | "them";
  text: string;
  faded?: boolean;
}

/**
 * Unified conversation pane. Renders every connection status as a single
 * chat surface — hello lines are folded into the message stream, and the
 * bottom area switches between composer, waiting hint, or a re-hello CTA.
 */
export function ConnectionThread({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();

  const [conn, setConn] = useState<Connection | null>(() => get(personId));
  const [typing, setTyping] = useState<boolean>(() => isTyping(personId));
  const [text, setText] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText("");
    const unsub = subscribe(() => {
      setConn(get(personId));
      setTyping(isTyping(personId));
    });
    setConn(get(personId));
    setTyping(isTyping(personId));
    markSeen(personId);
    return () => { unsub(); };
  }, [personId]);

  const bubbles = useMemo<Bubble[]>(() => {
    if (!conn) return [];
    const out: Bubble[] = [];
    const dim = conn.status === "faded";
    const openerFromMe = conn.initiatedBy === "me";
    if (openerFromMe && conn.fromMe) {
      out.push({ id: "hello-me", from: "me", text: conn.fromMe.reply, faded: dim });
    }
    if (!openerFromMe && conn.fromThem) {
      out.push({ id: "hello-them", from: "them", text: conn.fromThem.reply, faded: dim });
    }
    if (conn.fromThem && openerFromMe) {
      out.push({ id: "hello-them", from: "them", text: conn.fromThem.reply, faded: dim });
    }
    if (conn.fromMe && !openerFromMe) {
      out.push({ id: "hello-me", from: "me", text: conn.fromMe.reply, faded: dim });
    }
    for (const m of conn.messages as ChatMsg[]) {
      out.push({ id: m.id, from: m.from, text: m.text, faded: dim });
    }
    return out;
  }, [conn]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [bubbles.length, typing]);

  const person = getPersonById(personId);
  if (!person || !conn) return null;
  const loc = localized(person, lang);

  function submit() {
    if (!conn) return;
    const v = text.trim();
    if (!v) return;
    if (conn.status === "connected") {
      send(personId, v);
      setText("");
    } else if (conn.status === "incoming") {
      respondToIncoming(personId, { quotedMomentId: null, reply: v });
      setText("");
    }
  }

  function tryAgain() {
    undoFadedFor(personId);
    setFocusPerson(personId);
    const session = conn?.originSessionId;
    if (session) void navigate({ to: "/matchmaker", search: { session } });
    else void navigate({ to: "/" });
  }

  const isConnected = conn.status === "connected";
  const isIncoming = conn.status === "incoming";
  const isSent = conn.status === "sent";
  const isFaded = conn.status === "faded";
  const composerEnabled = isConnected || isIncoming;
  const composerPlaceholder = isIncoming
    ? t("connection.incoming_hint")
    : t("connection.composer_placeholder");

  const originSession = conn.originSessionId ?? null;
  function backToOrigin() {
    if (!originSession) return;
    setFocusPerson(personId);
    void navigate({ to: "/matchmaker", search: { session: originSession } });
  }

  return (
    <div className="h-full flex flex-col">
      {originSession && (
        <button
          type="button"
          onClick={backToOrigin}
          className="w-full text-left px-5 py-2 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary/40 border-b border-border transition-colors inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("connection.back_to_origin", { defaultValue: "Back to conversation" })}
        </button>
      )}
      {/* Header — avatar+name is the profile trigger */}
      <div className="border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-md -mx-1 px-1 py-1 hover:bg-secondary/60 transition-colors"
        >
          <img
            src={avatarUrl(person.id)}
            alt={loc.name}
            className={[
              "w-9 h-9 rounded-full border border-border shrink-0",
              isFaded ? "grayscale opacity-70" : "",
            ].join(" ")}
          />
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-foreground truncate">{loc.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{loc.occupation} · {loc.city}</div>
          </div>
        </button>

        {(isSent || isFaded || isIncoming) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More"
                className="shrink-0 w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isSent && (
                <DropdownMenuItem onSelect={() => withdrawSent(personId)}>
                  {t("connection.withdraw")}
                </DropdownMenuItem>
              )}
              {isFaded && (
                <>
                  <DropdownMenuItem onSelect={tryAgain}>
                    {t("connection.say_hello_again")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => removeFaded(personId)}>
                    {t("connection.remove")}
                  </DropdownMenuItem>
                </>
              )}
              {isIncoming && (
                <DropdownMenuItem onSelect={() => dismissIncoming(personId)}>
                  {t("incoming.dismiss")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-md mx-auto">
          <ul className="space-y-2.5">
            {bubbles.map((b) => (
              <li key={b.id} className={b.from === "me" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                <div
                  className={[
                    "max-w-[80%] px-3.5 py-2 text-[14px] leading-relaxed",
                    b.from === "me"
                      ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-2xl rounded-bl-md bg-secondary text-foreground",
                    b.faded ? "opacity-60" : "",
                  ].join(" ")}
                >
                  {b.text}
                </div>
              </li>
            ))}
            {typing && isConnected && (
              <li className="flex flex-col items-start" aria-live="polite">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-secondary text-foreground/70 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-[pulse_1.2s_ease-in-out_infinite]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-[pulse_1.2s_ease-in-out_0.2s_infinite]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-[pulse_1.2s_ease-in-out_0.4s_infinite]" />
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Bottom: composer only when the conversation is actionable. */}
      {composerEnabled && (
        <div className="border-t border-border bg-background px-4 py-3">
          <div className="max-w-md mx-auto">
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                rows={1}
                placeholder={composerPlaceholder}
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!text.trim()}
                aria-label="Send"
                className="absolute right-2 bottom-1.5 w-8 h-8 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-25 hover:opacity-90 transition-opacity"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <PublicProfileSheet person={person} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
