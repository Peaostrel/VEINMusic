"use client";

import type { ProfileViewProps } from "./useProfilePage";

export function ImportConfirmModal({
  showImportConfirm,
  setShowImportConfirm,
  executeLastfmImport,
}: ProfileViewProps) {
  return (
    <>
      {showImportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#121212] p-6 rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-black text-white mb-4">
              Подтверждение импорта
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              История из Last.fm будет импортирована в фоне. Повторный импорт
              добавит{" "}
              <span className="text-[var(--accent)] font-bold">
                только новые прослушивания
              </span>
              , дубликатов не будет. Продолжить?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowImportConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={executeLastfmImport}
                className="flex-1 px-4 py-2.5 rounded-xl font-black text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] hover:scale-105 transition-transform"
              >
                Перенести
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
