import { Link } from "@tanstack/react-router";
import irisAvatar from "@/assets/iris-avatar.png";

interface Props {
  onReset?: () => void;
}

export function IrisHeader({ onReset }: Props) {
  return (
    <header className="w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src={irisAvatar}
            alt=""
            width={28}
            height={28}
            className="w-7 h-7 rounded-full object-cover border border-border"
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground tracking-tight">
              Iris
            </div>
            <div className="text-[10.5px] text-muted-foreground">
              你的红娘
            </div>
          </div>
        </Link>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            重新开始
          </button>
        )}
      </div>
    </header>
  );
}
