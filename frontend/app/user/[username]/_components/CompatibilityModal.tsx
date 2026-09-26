"use client";

import type { ProfileViewProps } from "./useProfilePage";

export function CompatibilityModal({
  compatibility,
  compatModalOpen,
  setCompatModalOpen,
  compatLoading,
}: ProfileViewProps) {
  return (
    <>
      {compatModalOpen && (
        <dialog
          open
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm border-0 bg-transparent outline-none w-full h-full"
        >
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default border-none bg-transparent outline-none"
            aria-label="Закрыть"
            onClick={() => setCompatModalOpen(false)}
          />
          <div className="bg-[#141416] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative border border-purple-500/30 p-6 z-10 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-purple-400 uppercase tracking-wider flex items-center gap-2">
                ⚡ Музыкальная совместимость
              </h3>
              <button
                type="button"
                onClick={() => setCompatModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-xl font-black border-none bg-transparent outline-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {compatLoading && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-purple-300">
                <div className="animate-spin border-2 border-purple-500 border-t-transparent rounded-full w-8 h-8"></div>
                <p className="text-xs font-mono">
                  Анализируем скробблы и жанры...
                </p>
              </div>
            )}

            {!compatLoading && compatibility && (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-6 bg-black/40 p-4 rounded-xl border border-white/5">
                  <div className="relative flex items-center justify-center w-24 h-24 rounded-full border-4 border-purple-500 bg-purple-950/30 shadow-[0_0_25px_rgba(168,85,247,0.3)]">
                    <span className="text-2xl font-black text-white">
                      {compatibility.score}%
                    </span>
                  </div>
                  <div>
                    <div className="text-xs text-purple-400 uppercase font-mono font-bold tracking-wider mb-1">
                      Уровень связи
                    </div>
                    <div className="text-lg font-black text-white">
                      {compatibility.tier}
                    </div>
                  </div>
                </div>

                {compatibility.common_artists &&
                  compatibility.common_artists.length > 0 && (
                    <div>
                      <h4 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">
                        Общие артисты
                      </h4>
                      <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar">
                        {compatibility.common_artists.map((item) => (
                          <span
                            key={item.artist}
                            className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-xs font-medium text-white flex items-center gap-1.5"
                          >
                            <span>🎵 {item.artist}</span>
                            <span className="text-[10px] text-purple-400 font-mono">
                              ({item.total_plays} пл.)
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {compatibility.common_genres &&
                  compatibility.common_genres.length > 0 && (
                    <div>
                      <h4 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">
                        Общие жанры
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {compatibility.common_genres.map((g: string) => (
                          <span
                            key={g}
                            className="bg-purple-950/40 border border-purple-500/30 px-2.5 py-1 rounded-md text-xs font-medium text-purple-200"
                          >
                            #{g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {!compatLoading && !compatibility && (
              <div className="text-center py-8 text-gray-400 text-sm">
                Войдите в аккаунт, чтобы сравнить ваши музыкальные вкусы!
              </div>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
