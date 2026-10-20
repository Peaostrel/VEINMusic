"use client";

import { AlertTriangle } from "lucide-react";
import Dialog from "@/components/Dialog";
import { useT } from "@/app/lib/i18n/client";

/** Asks to confirm a showcase change, which locks it for 30 days. */
export default function ConfirmShowcaseModal({
  onCancel,
  onConfirm,
}: Readonly<{ onCancel: () => void; onConfirm: () => void }>) {
  const t = useT();
  return (
    <Dialog
      label={t("Подтверждение изменения витрины")}
      onClose={onCancel}
      className=""
    >
      <div className="relative w-full max-w-md bg-surface p-8 rounded-xl overflow-hidden border border-line text-center space-y-6 transform animate-in fade-in zoom-in duration-200">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-10 h-10 text-accent" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-semibold text-fg tracking-tight">
          {t("Подтверждение")}
        </h2>
        <p className="text-fg-2 text-sm leading-relaxed">
          {t(
            "Вы изменили витрину профиля! Вы точно хотите утвердить этих любимых исполнителей, треки или альбомы?",
          )}{" "}
          <br />
          <br />
          <strong className="text-accent">
            {t("Они будут заблокированы на 30 дней.")}
          </strong>
        </p>
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 rounded-xl font-medium text-fg-2 bg-surface-2 hover:bg-line transition-colors"
          >
            {t("Отмена")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-xl font-semibold text-black transition-all shadow-[var(--accent)]/20"
          >
            {t("Сохранить")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
