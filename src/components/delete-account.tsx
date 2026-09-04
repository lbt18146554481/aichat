import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteAccount } from "@/lib/auth";

export function DeleteAccount() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const required = t("delete_account.confirm_word");
  const canConfirm = confirmText.trim().toLowerCase() === required.toLowerCase();

  async function execute() {
    if (!canConfirm) return;
    await deleteAccount();
    setOpen(false);
    toast.success(t("delete_account.done"));
    void navigate({ to: "/auth" });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="w-full rounded-2xl border border-destructive/30 bg-card px-4 py-3.5 min-h-[52px] flex items-center gap-3 text-[14px] text-destructive active:bg-destructive/5 transition-colors"
        >
          <AlertTriangle className="w-[18px] h-[18px]" strokeWidth={1.75} />
          {t("delete_account.label")}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete_account.title")}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>{t("delete_account.body")}</p>
            <p className="text-xs text-muted-foreground">
              {t("delete_account.confirm_prompt", { word: required })}
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={required}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/50"
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText("")}>
            {t("delete_account.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void execute()}
            disabled={!canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
          >
            {t("delete_account.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
