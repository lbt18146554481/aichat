import { useTranslation } from "react-i18next";
import { ShortlistTile } from "./shortlist-tile";
import { CandidateDetail } from "./candidate-detail";
import { CompareView } from "./compare-view";

interface Props {
  shortlistIds: string[];
  selectedId: string | null;
  savedIds: string[];
  dismissedIds: string[];
  compareMode: boolean;
  onSelect: (id: string) => void;
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
  onTellMore: (id: string) => void;
  onFindSimilar: (id: string) => void;
  onExitCompare: () => void;
}

export function CanvasPane({
  shortlistIds,
  selectedId,
  savedIds,
  dismissedIds,
  compareMode,
  onSelect,
  onSave,
  onDismiss,
  onTellMore,
  onFindSimilar,
  onExitCompare,
}: Props) {
  const { t } = useTranslation();

  if (compareMode) {
    return (
      <div className="h-full flex flex-col bg-secondary/30">
        <div className="h-11 px-5 flex items-center justify-between border-b border-border bg-background/60 backdrop-blur shrink-0">
          <div className="text-[11px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
            {t("compare.title")}
          </div>
          <button
            onClick={onExitCompare}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
          >
            ← {t("compare.back")}
          </button>
        </div>
        <CompareView savedIds={savedIds} />
      </div>
    );
  }

  const empty = shortlistIds.length === 0;

  return (
    <div className="h-full flex flex-col bg-secondary/30">
      <div className="h-11 px-5 flex items-center justify-between border-b border-border bg-background/60 backdrop-blur shrink-0">
        <div className="text-[11px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
          {t("canvas.title")}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-muted-foreground">
          {shortlistIds.length}
        </div>
      </div>

      {empty ? (
        <EmptyCanvas />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
              {shortlistIds.map((id) => (
                <ShortlistTile
                  key={id}
                  personId={id}
                  selected={selectedId === id}
                  saved={savedIds.includes(id)}
                  dismissed={dismissedIds.includes(id)}
                  onSelect={() => onSelect(id)}
                  onTellMore={() => onTellMore(id)}
                  onDismiss={() => onDismiss(id)}
                />
              ))}
            </div>

            {selectedId && (
              <CandidateDetail
                personId={selectedId}
                saved={savedIds.includes(selectedId)}
                dismissed={dismissedIds.includes(selectedId)}
                onSave={() => onSave(selectedId)}
                onDismiss={() => onDismiss(selectedId)}
                onFindSimilar={() => onFindSimilar(selectedId)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyCanvas() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 grid place-items-center p-8">
      <div className="max-w-xs text-center">
        <div className="mx-auto w-10 h-10 rounded-md border border-dashed border-border grid place-items-center text-muted-foreground font-mono text-sm">
          ∅
        </div>
        <h3 className="mt-4 text-[14px] font-semibold text-foreground">
          {t("canvas.empty_title")}
        </h3>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
          {t("canvas.empty_hint")}
        </p>
      </div>
    </div>
  );
}
