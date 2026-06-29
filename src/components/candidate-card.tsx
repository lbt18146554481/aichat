import { Link } from "@tanstack/react-router";
import { avatarUrl, getPersonById } from "@/lib/people";

interface Props {
  personId: string;
  why: string;
  disabled?: boolean;
  onLike: () => void;
  onPass: () => void;
}

export function CandidateCard({ personId, why, disabled, onLike, onPass }: Props) {
  const person = getPersonById(personId);
  if (!person) return null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden">
      <div className="p-4 flex items-start gap-3.5">
        <img
          src={avatarUrl(person.name)}
          alt=""
          className="w-12 h-12 rounded-full border border-border bg-secondary shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <div className="text-[15px] font-semibold text-foreground truncate">
              {person.name}
            </div>
            <div className="text-[11.5px] text-muted-foreground truncate">
              {person.age} · {person.city} · {person.occupation}
            </div>
          </div>
          <p className="mt-1.5 text-[13.5px] text-foreground leading-relaxed">
            {why}
          </p>
        </div>
      </div>
      <div className="px-4 pb-3 -mt-1 flex items-center justify-between">
        <Link
          to="/people/$id"
          params={{ id: person.id }}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          了解更多 →
        </Link>
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={onPass}
            className="px-3 py-1.5 rounded-full border border-border text-xs text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            不是我的菜
          </button>
          <button
            disabled={disabled}
            onClick={onLike}
            className="px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            想多了解
          </button>
        </div>
      </div>
    </div>
  );
}
