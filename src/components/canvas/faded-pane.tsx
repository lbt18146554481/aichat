import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";
import { get, removeFaded, subscribe, undoFadedFor, type Connection } from "@/lib/connections";
import { setFocusPerson } from "@/lib/seed";

interface Props { personId: string; }

export function FadedPane({ personId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const [conn, setConn] = useState<Connection | null>(() => get(personId));

  useEffect(() => {
    setConn(get(personId));
    const unsub = subscribe(() => setConn(get(personId)));
    return () => { unsub(); };
  }, [personId]);

  const person = getPersonById(personId);
  if (!person || !conn || conn.status !== "faded") return null;
  const loc = localized(person, lang);

  function tryAgain() {
    // Clear the faded record so Say hello can start fresh, then land the
    // user back on the person's intro card to compose a new hello.
    undoFadedFor(personId);
    setFocusPerson(personId);
    const session = conn?.originSessionId;
    if (session) void navigate({ to: "/matchmaker", search: { session } });
    else void navigate({ to: "/" });
  }

  function backToIntro() {
    setFocusPerson(personId);
    const session = conn?.originSessionId;
    if (session) void navigate({ to: "/matchmaker", search: { session } });
    else void navigate({ to: "/" });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={backToIntro}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="truncate max-w-[220px]">{t("connection.back_to_intro", { name: loc.name })}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-md mx-auto">
          <div className="flex items-start gap-4">
            <img
              src={avatarUrl(person.id)}
              alt={loc.name}
              className="w-14 h-14 rounded-full border border-border bg-secondary shrink-0 grayscale opacity-70"
            />
            <div className="min-w-0 pt-0.5">
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground mb-1">
                {t("connection.section_faded")}
              </div>
              <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
                {loc.name}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {loc.occupation} · {loc.city}
              </p>
            </div>
          </div>

          <p className="mt-7 text-[13px] text-muted-foreground leading-relaxed">
            {t("connection.faded_body")}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={tryAgain}
              className="px-4 h-9 rounded-md bg-foreground text-background text-[13px] hover:opacity-90 transition-opacity"
            >
              {t("connection.say_hello_again")}
            </button>
            <button
              type="button"
              onClick={() => removeFaded(personId)}
              className="px-3 h-9 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("connection.remove")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
