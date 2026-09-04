import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Ban, Flag, ShieldOff, Trash2, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBlocklist } from "@/data/hooks";
import { blockPerson, submitReport, unblockPerson } from "@/lib/blocklist";
import { deleteConnection } from "@/lib/connections";

interface Props {
  personId: string;
  onActionComplete?: () => void;
}

type ConfirmKind = "delete" | "blacklist" | null;

export function ProfileSafetyFooter({ personId, onActionComplete }: Props) {
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [reason, setReason] = useState<"spam" | "harassment" | "inappropriate" | "other">("other");
  const { data: blockedIds = [] } = useBlocklist();
  const blocked = blockedIds.includes(personId);

  function finish() {
    onActionComplete?.();
  }

  function sendReport() {
    submitReport({ personId, reason });
    setReportOpen(false);
    toast.success(t("report.submitted"));
  }

  function toggleMute() {
    if (blocked) {
      unblockPerson(personId);
      toast.success(t("report.unmuted"));
    } else {
      blockPerson(personId);
      toast.success(t("report.muted"));
      finish();
    }
  }

  function confirmDelete() {
    deleteConnection(personId);
    setConfirmKind(null);
    toast.success(t("connection.deleted"));
    finish();
  }

  function confirmBlacklist() {
    blockPerson(personId);
    deleteConnection(personId);
    setConfirmKind(null);
    toast.success(t("report.blacklisted"));
    finish();
  }

  return (
    <>
      <div className="mt-8 pt-6 border-t border-border">
        <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-3">
          {t("profile_safety.section_label")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-lg border border-border text-[12.5px] text-foreground hover:bg-secondary transition-colors"
          >
            <Flag className="w-3.5 h-3.5 shrink-0" />
            {t("report.report")}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-lg border border-border text-[12.5px] text-foreground hover:bg-secondary transition-colors"
          >
            {blocked ? (
              <ShieldOff className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Ban className="w-3.5 h-3.5 shrink-0" />
            )}
            {blocked ? t("report.unmute") : t("report.mute")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmKind("delete")}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-lg border border-destructive/30 text-[12.5px] text-destructive hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            {t("connection.delete_chat")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmKind("blacklist")}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-lg bg-destructive/10 border border-destructive/25 text-[12.5px] text-destructive hover:bg-destructive/15 transition-colors"
          >
            <UserX className="w-3.5 h-3.5 shrink-0" />
            {t("report.blacklist")}
          </button>
        </div>
      </div>

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
                  name="profile-report-reason"
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

      <Dialog open={confirmKind !== null} onOpenChange={(open) => !open && setConfirmKind(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmKind === "delete"
                ? t("connection.delete_chat_title")
                : t("report.blacklist_title")}
            </DialogTitle>
            <DialogDescription>
              {confirmKind === "delete"
                ? t("connection.delete_chat_body")
                : t("report.blacklist_body")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmKind(null)}
              className="px-4 py-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground"
            >
              {t("report.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmKind === "delete" ? confirmDelete : confirmBlacklist}
              className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90"
            >
              {confirmKind === "delete" ? t("connection.delete_chat") : t("report.blacklist")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
