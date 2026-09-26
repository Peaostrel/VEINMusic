"use client";

import { Award, X } from "lucide-react";
import type { ProfileViewProps } from "./useProfilePage";

export function ProfileToasts({ toasts, removeToast }: ProfileViewProps) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[90] flex flex-col gap-3"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto relative flex w-80 items-center gap-3.5 rounded-xl border border-line bg-surface-2 p-3.5 pr-9 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-2xl">
            {t.image ? (
              <img
                src={t.image}
                className="h-full w-full object-cover"
                alt=""
              />
            ) : (
              t.icon
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-accent">
              <Award className="h-3.5 w-3.5" aria-hidden="true" />
              Новое достижение
            </span>
            <span className="truncate text-sm font-medium">{t.name}</span>
            {t.xp > 0 && (
              <span className="font-mono text-[11px] text-ok">+{t.xp} XP</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            aria-label="Закрыть уведомление"
            className="absolute right-2 top-2 rounded p-1 text-fg-3 hover:text-fg"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
