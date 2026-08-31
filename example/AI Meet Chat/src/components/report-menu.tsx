import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Flag, Shield, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBlocklist, useModerationActions } from "@/data/hooks";

interface Props {
  personId: string;
  align?: "start" | "end" | "center";
}

export function ReportMenu({ personId, align = "end" }: Props) {
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<"spam" | "harassment" | "inappropriate" | "other">("other");
  const blockedIds = useBlocklist().data;
  const { block, unblock, report } = useModerationActions();
  const blocked = blockedIds.includes(personId);

  function toggleBlock() {
    if (blocked) {
      void unblock(personId);
      toast.success(t("report.unblocked"));
    } else {
      void block(personId);
      toast.success(t("report.blocked"));
    }
  }

  function sendReport() {
    void report(personId, reason);
    setReportOpen(false);
    toast.success(t("report.submitted"));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("report.menu_label")}
            className="shrink-0 w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-48">
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>
            <Flag className="w-3.5 h-3.5 mr-2" />
            {t("report.report")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleBlock}>
            <Shield className="w-3.5 h-3.5 mr-2" />
            {blocked ? t("report.unblock") : t("report.block")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("report.title")}</DialogTitle>
            <DialogDescription>{t("report.body")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {(["spam", "harassment", "inappropriate", "other"] as const).map((r) => (
              <label
                key={r}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-secondary/50"
              >
                <input
                  type="radio"
                  name="report-reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-primary"
                />
                <span className="text-[13px] text-foreground">{t(`report.reason_${r}`)}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="px-4 py-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground"
            >
              {t("report.cancel")}
            </button>
            <button
              type="button"
              onClick={sendReport}
              className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90"
            >
              {t("report.submit")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
