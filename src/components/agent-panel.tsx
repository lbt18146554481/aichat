import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { AGENTS, type AgentState, type AgentStatus } from "@/lib/agents";

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "working") {
    return <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />;
  }
  if (status === "done") {
    return (
      <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-accent">
        <Check className="w-2.5 h-2.5 text-accent-foreground" strokeWidth={3} />
      </span>
    );
  }
  return <span className="w-2 h-2 rounded-full bg-border" />;
}

function StatusLabel({ status }: { status: AgentStatus }) {
  const label =
    status === "working" ? "Working" : status === "done" ? "Done" : "Idle";
  const cls =
    status === "working"
      ? "text-accent"
      : status === "done"
        ? "text-foreground"
        : "text-muted-foreground";
  return <span className={`text-[11px] font-medium ${cls}`}>{label}</span>;
}

function Monogram({ letter }: { letter: string }) {
  return (
    <div className="w-9 h-9 rounded-lg bg-secondary border border-border grid place-items-center text-sm font-semibold text-foreground tracking-tight shrink-0">
      {letter}
    </div>
  );
}

export function AgentPanel({
  state,
  className = "",
}: {
  state: AgentState;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <aside className={`flex flex-col gap-3 ${className}`}>
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Your AI team
        </div>
        <p className="mt-1 text-xs text-muted-foreground/80 leading-relaxed">
          Four agents working on your behalf.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {AGENTS.map((a) => {
          const status = state[a.id];
          const open = openId === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setOpenId(open ? null : a.id)}
              className="text-left bg-card border border-border rounded-xl p-3 shadow-soft hover:border-foreground/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Monogram letter={a.name[0]} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {a.name}
                    </span>
                    <StatusDot status={status} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {a.role}
                  </div>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
                      {a.detail}
                      <div className="mt-2 flex items-center gap-1.5">
                        <StatusLabel status={status} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
