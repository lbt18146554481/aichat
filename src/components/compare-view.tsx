import { useState } from "react";
import { useTranslation } from "react-i18next";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  savedIds: string[];
}

export function CompareView({ savedIds }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [toast, setToast] = useState<string | null>(null);

  if (savedIds.length < 2) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <p className="text-[13px] text-muted-foreground">{t("compare.empty")}</p>
      </div>
    );
  }

  const people = savedIds
    .map((id) => getPersonById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Differences = signals that some have and others don't.
  const allSignals = Array.from(new Set(people.flatMap((p) => p.signals)));
  const diffSignals = allSignals.filter(
    (s) => people.some((p) => p.signals.includes(s)) &&
           people.some((p) => !p.signals.includes(s)),
  );

  function reachOut(name: string) {
    setToast(t("compare.reach_out_toast", { name }));
    window.setTimeout(() => setToast(null), 2400);
  }

  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="p-5 space-y-5">
        <p className="text-[13px] text-muted-foreground font-mono leading-relaxed">
          <span className="text-foreground/60 mr-1">›</span>
          {t("compare.agent_note")}
        </p>

        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {people.map((p) => {
            const L = localized(p, lang);
            return (
              <article
                key={p.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl(p.id)}
                    alt=""
                    className="w-11 h-11 rounded-full border border-border bg-secondary"
                  />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-foreground truncate">
                      {L.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {p.age} · {L.city}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[12.5px] text-foreground/80 leading-relaxed">
                  {L.portrait}
                </p>

                {diffSignals.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-mono mb-1.5">
                      {t("compare.differences")}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {diffSignals.map((s) => {
                        const has = p.signals.includes(s);
                        return (
                          <span
                            key={s}
                            className={`px-1.5 py-0.5 rounded text-[10.5px] font-mono border ${
                              has
                                ? "border-foreground/60 bg-secondary text-foreground"
                                : "border-dashed border-border text-muted-foreground/60"
                            }`}
                          >
                            {has ? "" : "− "}
                            {t(`signal.${s}`, { defaultValue: s })}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => reachOut(L.name)}
                  className="mt-4 w-full px-3 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  {t("compare.reach_out")}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-foreground text-background text-[12.5px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
