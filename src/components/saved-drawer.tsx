import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  open: boolean;
  savedIds: string[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onSelect?: (id: string) => void;
  onCompare?: () => void;
}

export function SavedDrawer({
  open,
  savedIds,
  onClose,
  onRemove,
  onSelect,
  onCompare,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const canCompare = savedIds.length >= 2;

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-border shrink-0">
          <h2 className="text-sm font-semibold tracking-tight">{t("saved.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("saved.close")}
            className="w-7 h-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {canCompare && (
          <div className="px-5 py-3 border-b border-border bg-secondary/40 shrink-0">
            <p className="text-[12px] text-muted-foreground font-mono leading-relaxed mb-2">
              <span className="text-foreground/60 mr-1">›</span>
              {t("saved.compare_hint", { count: savedIds.length })}
            </p>
            <button
              onClick={onCompare}
              className="w-full px-3 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              {t("saved.compare")}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {savedIds.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("saved.empty")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {savedIds.map((id) => {
                const p = getPersonById(id);
                if (!p) return null;
                const L = localized(p, lang);
                return (
                  <li
                    key={id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <img
                      src={avatarUrl(p.id)}
                      alt=""
                      className="w-9 h-9 rounded-full border border-border bg-secondary shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelect?.(id)}
                        className="text-sm font-semibold text-foreground hover:underline underline-offset-4 text-left"
                      >
                        {L.name}
                      </button>
                      <div className="text-[11.5px] text-muted-foreground font-mono">
                        {p.age} · {L.city} · {L.occupation}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemove(id)}
                      className="text-[11px] text-muted-foreground hover:text-destructive px-2 py-1 rounded"
                    >
                      {t("saved.remove")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
