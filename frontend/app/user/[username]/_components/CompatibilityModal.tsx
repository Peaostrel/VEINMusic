"use client";

import { X } from "lucide-react";
import Dialog from "@/components/Dialog";
import { Loading, Meter } from "@/components/ui";
import type { ProfileViewProps } from "./useProfilePage";

export function CompatibilityModal({
  compatibility,
  compatModalOpen,
  setCompatModalOpen,
  compatLoading,
}: ProfileViewProps) {
  if (!compatModalOpen) return null;
  const close = () => setCompatModalOpen(false);
  return (
    <Dialog label="Музыкальная совместимость" onClose={close}>
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Музыкальная совместимость</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="rounded p-1 text-fg-3 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {compatLoading && <Loading label="Сравниваем прослушивания…" />}

        {!compatLoading && compatibility && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-4xl font-medium">
                  {compatibility.score}%
                </span>
                <span className="text-sm text-fg-2">{compatibility.tier}</span>
              </div>
              <Meter value={compatibility.score} height={4} />
            </div>

            {compatibility.common_artists &&
              compatibility.common_artists.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs text-fg-2">Общие артисты</h3>
                  <ul className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {compatibility.common_artists.map((item) => (
                      <li
                        key={item.artist}
                        className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs"
                      >
                        {item.artist}
                        <span className="font-mono text-[11px] text-fg-3">
                          {item.total_plays}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

            {compatibility.common_genres &&
              compatibility.common_genres.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs text-fg-2">Общие жанры</h3>
                  <ul className="flex flex-wrap gap-2">
                    {compatibility.common_genres.map((g: string) => (
                      <li
                        key={g}
                        className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-fg-2"
                      >
                        {g}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
          </>
        )}

        {!compatLoading && !compatibility && (
          <p className="py-6 text-center text-sm text-fg-2">
            Войдите в аккаунт, чтобы сравнить вкусы.
          </p>
        )}
      </div>
    </Dialog>
  );
}
