// SavedTrigger — global header entry for "Saved for later".
//
// Mirrors HistoryTrigger visually. Reads from the cross-session saved store,
// so the same list appears on the home page, inside any Side by Side wish,
// or on any workspace page. Count-bearing only when there's at least one
// saved candidate; a subtle dot indicates unopened growth.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck, MessageCircle, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  listSaved,
  removeSaved,
  subscribeSaved,
  type SavedRecord,
} from "@/lib/saved-intents";
import { getIntentById, type Intent } from "@/lib/intents";
import { avatarUrl, getPersonById } from "@/lib/people";
import { getSession } from "@/lib/sessions";
import type { Lang } from "@/lib/i18n";

interface Props {
  variant?: "default" | "compact";
}

function useSavedList(): SavedRecord[] {
  const snapshot = useSyncExternalStore(
    subscribeSaved,
    () => JSON.stringify(listSaved()),
    () => "[]",
  );
  try {
    const parsed = JSON.parse(snapshot) as SavedRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function SavedTrigger({ variant = "default" }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const saved = useSavedList();
  const count = saved.length;

  if (count === 0) return null;

  const btnClass =
    variant === "compact"
      ? "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors";

  function handleOpenChat(rec: SavedRecord) {
    setOpen(false);
    // Deep-link to the wish's session with an intent to open TA chat directly.
    void navigate({
      to: "/side-by-side",
      search: { session: rec.sessionId, chatWith: rec.intentId } as any,
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className={btnClass}
        aria-label={t("saved.header_aria")}
        onClick={() => setOpen(true)}
      >
        <BookmarkCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span>{t("saved.header", { count })}</span>
      </button>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
          <SheetTitle className="text-[16px] font-semibold tracking-tight text-foreground text-left">
            {t("saved.title")}
          </SheetTitle>
          <p className="text-[12px] text-muted-foreground text-left">
            {t("saved.subtitle")}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {saved.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-[13px]">{t("saved.empty")}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {saved.map((rec) => {
                const intent = getIntentById(rec.intentId) as Intent | null;
                if (!intent) return null;
                const person = getPersonById(intent.ownerId);
                const name = lang === "zh-CN" ? intent.ownerName_zh : intent.ownerName;
                const city = lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity;
                const occ = person
                  ? (lang === "zh-CN" ? person.occupation_zh : person.occupation)
                  : "";
                const meta = [city, occ].filter((s) => s && s.trim()).join(" · ");
                const raw = lang === "zh-CN" ? intent.rawText_zh : intent.rawText;
                const session = getSession(rec.sessionId);
                const wishSummary = session?.seed ?? "";

                return (
                  <li key={rec.intentId} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={avatarUrl(intent.ownerId)}
                        alt=""
                        className="w-10 h-10 rounded-full border border-border"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium text-foreground truncate">
                          {name}
                          {person?.age ? (
                            <span className="text-muted-foreground font-normal">
                              , {person.age}
                            </span>
                          ) : null}
                        </div>
                        {meta && (
                          <div className="text-[11.5px] text-muted-foreground truncate">
                            {meta}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-[12.5px] text-foreground/85 leading-relaxed line-clamp-3">
                      "{raw}"
                    </p>
                    {wishSummary && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
                        {t("saved.from_wish")}: {wishSummary}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => handleOpenChat(rec)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:opacity-90 transition-opacity"
                      >
                        <MessageCircle className="w-3 h-3" />
                        {t("saved.start_chat")}
                      </button>
                      <button
                        onClick={() => removeSaved(rec.intentId)}
                        aria-label={t("saved.remove")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-[12.5px] text-foreground/85 hover:bg-secondary transition-colors"
                      >
                        <X className="w-3 h-3" />
                        {t("saved.remove")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Hook: subscribe to whether a given intent is currently saved. */
export function useIsSaved(intentId: string | null | undefined): boolean {
  const [flag, setFlag] = useState<boolean>(() => {
    if (typeof window === "undefined" || !intentId) return false;
    return listSaved().some((r) => r.intentId === intentId);
  });
  useEffect(() => {
    if (!intentId) {
      setFlag(false);
      return;
    }
    const check = () => setFlag(listSaved().some((r) => r.intentId === intentId));
    check();
    return subscribeSaved(check);
  }, [intentId]);
  return flag;
}

