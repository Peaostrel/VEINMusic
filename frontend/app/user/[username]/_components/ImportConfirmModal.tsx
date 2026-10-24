"use client";

import Dialog from "@/components/Dialog";
import { btn } from "@/components/ui";
import type { ProfileViewProps } from "./useProfilePage";
import { useT } from "@/app/lib/i18n/client";

export function ImportConfirmModal({
  showImportConfirm,
  setShowImportConfirm,
  executeLastfmImport,
}: ProfileViewProps) {
  const t = useT();
  if (!showImportConfirm) return null;
  return (
    <Dialog
      label={t("Импорт из Last.fm")}
      onClose={() => setShowImportConfirm(false)}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("Импорт из Last.fm")}</h2>
        <p className="text-sm leading-relaxed text-fg-2">
          {t(
            "История из Last.fm перенесётся в фоне с исходными датами, за каждое прослушивание начислится XP. Прослушивания, которые уже есть в VEIN, не задвоятся. Импорт разовый: повторно запустить его будет нельзя.",
          )}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowImportConfirm(false)}
            className={`${btn.secondary} ${btn.md}`}
          >
            {t("Отмена")}
          </button>
          <button
            type="button"
            onClick={executeLastfmImport}
            className={`${btn.primary} ${btn.md}`}
          >
            {t("Перенести")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
