import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus, Trash2, Users, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { loadChats, deleteChat, allFoundPeopleIds, type Chat } from "@/lib/chats";

function groupByDate(chats: Chat[]) {
  const now = new Date();
  const today: Chat[] = [];
  const yesterday: Chat[] = [];
  const earlier: Chat[] = [];
  for (const c of chats) {
    const d = new Date(c.updatedAt);
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const isYest = d.toDateString() === yest.toDateString();
    if (sameDay) today.push(c);
    else if (isYest) yesterday.push(c);
    else earlier.push(c);
  }
  return { today, yesterday, earlier };
}

interface Props {
  refreshKey?: number;
  onClose?: () => void;
}

export function ChatSidebar({ refreshKey, onClose }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [chats, setChats] = useState<Chat[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);

  useEffect(() => {
    const all = loadChats().sort((a, b) => b.updatedAt - a.updatedAt);
    setChats(all);
    setPeopleCount(allFoundPeopleIds().length);
  }, [refreshKey, pathname]);

  const { today, yesterday, earlier } = groupByDate(chats);

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    deleteChat(id);
    setChats(loadChats().sort((a, b) => b.updatedAt - a.updatedAt));
    if (pathname === `/c/${id}`) navigate({ to: "/" });
  }

  function renderGroup(label: string, items: Chat[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="px-2 mb-1 text-[11px] font-medium text-muted-foreground">
          {label}
        </div>
        <div className="flex flex-col">
          {items.map((c) => {
            const active = pathname === `/c/${c.id}`;
            return (
              <Link
                key={c.id}
                to="/c/$chatId"
                params={{ chatId: c.id }}
                onClick={onClose}
                className={[
                  "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground transition-colors",
                  active ? "bg-border/60" : "hover:bg-border/40",
                ].join(" ")}
              >
                <span className="flex-1 truncate">{c.title}</span>
                <button
                  onClick={(e) => handleDelete(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 -m-1 text-muted-foreground hover:text-foreground rounded"
                  aria-label="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-sidebar text-foreground border-r border-border w-[260px]">
      {/* Header */}
      <div className="p-3 border-b border-border/60">
        <Link
          to="/"
          onClick={onClose}
          className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-border/40 transition-colors"
        >
          <span className="grid place-items-center w-6 h-6 rounded-md bg-foreground text-background text-[11px] font-semibold">
            B
          </span>
          <span className="text-sm font-semibold tracking-tight">Bloom</span>
        </Link>
        <button
          onClick={() => {
            onClose?.();
            navigate({ to: "/" });
          }}
          className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background hover:bg-border/40 text-sm font-medium transition-colors"
        >
          <span className="flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4" /> New chat
          </span>
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {chats.length === 0 ? (
          <div className="px-2 py-6 text-xs text-muted-foreground">
            No conversations yet. Start one from the home page.
          </div>
        ) : (
          <>
            {renderGroup("Today", today)}
            {renderGroup("Yesterday", yesterday)}
            {renderGroup("Earlier", earlier)}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border/60 flex flex-col gap-0.5">
        <Link
          to="/people"
          onClick={onClose}
          className={[
            "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
            pathname.startsWith("/people")
              ? "bg-border/60 text-foreground"
              : "text-foreground hover:bg-border/40",
          ].join(" ")}
        >
          <Users className="w-4 h-4" />
          <span className="flex-1">People</span>
          {peopleCount > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {peopleCount}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </div>
      </div>
    </div>
  );
}
