"use client";

import Dialog from "@/components/Dialog";
import { btn } from "@/components/ui";
import type { ProfileViewProps } from "./useProfilePage";

export function ImportConfirmModal({
  showImportConfirm,
  setShowImportConfirm,
  executeLastfmImport,
}: ProfileViewProps) {
  if (!showImportConfirm) return null;
  return (
    <Dialog
      label="Импорт из Last.fm"
      onClose={() => setShowImportConfirm(false)}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold">Импорт из Last.fm</h2>
        <p className="text-sm leading-relaxed text-fg-2">
          История из Last.fm перенесётся в фоне. Повторный импорт добавит только
          новые прослушивания — дубликатов не будет.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowImportConfirm(false)}
            className={`${btn.secondary} ${btn.md}`}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={executeLastfmImport}
            className={`${btn.primary} ${btn.md}`}
          >
            Перенести
          </button>
        </div>
      </div>
    </Dialog>
  );
}
