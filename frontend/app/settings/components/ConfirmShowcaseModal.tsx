"use client";

import { AlertTriangle } from "lucide-react";
import Dialog from "@/components/Dialog";

/** Asks to confirm a showcase change, which locks it for 30 days. */
export default function ConfirmShowcaseModal({
  onCancel,
  onConfirm,
}: Readonly<{ onCancel: () => void; onConfirm: () => void }>) {
  return (
    <Dialog
      label="Подтверждение изменения витрины"
      onClose={onCancel}
      className="backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md bg-[#121212] p-8 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10 text-center space-y-6 transform animate-in fade-in zoom-in duration-200">
        <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle
            className="w-10 h-10 text-yellow-500"
            aria-hidden="true"
          />
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight">
          Подтверждение
        </h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          Вы изменили витрину профиля! Вы точно хотите утвердить этих любимых
          исполнителей, треки или альбомы? <br />
          <br />
          <strong className="text-yellow-500">
            Они будут заблокированы на 30 дней.
          </strong>
        </p>
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-xl font-black text-black bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] hover:scale-105 transition-all shadow-lg shadow-[var(--accent)]/20"
          >
            Сохранить
          </button>
        </div>
      </div>
    </Dialog>
  );
}
