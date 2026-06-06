import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  addAgent,
  removeAgent,
  toggleAgent,
  type CustomAgent,
} from "@/lib/custom-agents";

interface Props {
  agents: CustomAgent[];
  onChange: () => void;
  rightSlot?: React.ReactNode;
}

export function AgentTagRow({ agents, onChange, rightSlot }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    addAgent(name, desc);
    setName("");
    setDesc("");
    setOpen(false);
    onChange();
  }

  return (
    <div className="flex items-center flex-wrap gap-1.5">
      {agents.map((a) => (
        <span
          key={a.id}
          className={[
            "group inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs border transition-colors",
            a.enabled
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-muted-foreground border-border hover:text-foreground",
          ].join(" ")}
        >
          <button
            onClick={() => {
              toggleAgent(a.id);
              onChange();
            }}
            title={a.description || a.name}
            className="font-medium"
          >
            {a.name}
          </button>
          <button
            onClick={() => {
              removeAgent(a.id);
              onChange();
            }}
            className="opacity-60 hover:opacity-100 p-0.5 rounded-full"
            aria-label={`Remove ${a.name}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {open ? (
        <div className="inline-flex items-center gap-1.5 px-1 py-1 rounded-full border border-border bg-background">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Agent name"
            className="bg-transparent text-xs px-2 py-0.5 outline-none w-28 placeholder:text-muted-foreground"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="What it does (optional)"
            className="bg-transparent text-xs px-2 py-0.5 outline-none w-44 placeholder:text-muted-foreground border-l border-border"
          />
          <button
            onClick={handleAdd}
            className="px-2 py-0.5 rounded-full bg-foreground text-background text-xs font-medium"
          >
            Add
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add agent
        </button>
      )}

      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}
