import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { clearLegacyKeys } from "@/lib/chats";

export function AppLayout({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    clearLegacyKeys();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setRefreshKey((k) => k + 1);
  }, [pathname]);

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">
        <ChatSidebar refreshKey={refreshKey} />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-foreground/30 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="md:hidden fixed left-0 top-0 bottom-0 z-50">
            <ChatSidebar
              refreshKey={refreshKey}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 text-foreground"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link to="/" className="flex items-center gap-1.5">
            <span className="grid place-items-center w-5 h-5 rounded-md bg-foreground text-background text-[10px] font-semibold">
              B
            </span>
            <span className="text-sm font-semibold tracking-tight">Bloom</span>
          </Link>
          <span className="w-9" />
        </header>

        <main className="flex-1 min-h-0">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}

// Avoid unused import errors
void X;
