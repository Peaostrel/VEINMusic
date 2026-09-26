"use client";

import { getPlatformIcon } from "../../../../utils/formatters";
import { getSafeUrl, getArtistUrl, getTrackUrl } from "./profileUtils";
import { HistoryItem } from "./HistoryItem";
import type { ProfileViewProps } from "./useProfilePage";
import { useNow } from "./hooks";

export function ProfileMainGrid({ data, recs, wrapped }: ProfileViewProps) {
  const now = useNow();
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
        <div className="lg:col-span-2 space-y-8">
          {recs.length > 0 && (
            <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl border border-[var(--accent)]/20">
              <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-[var(--accent-text)]">
                <span className="text-2xl">✨</span> Рекомендации
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {recs.map((r) => (
                  <div
                    key={r.artist}
                    className="min-w-[150px] bg-white/5 p-3 rounded-xl border border-white/5 hover:border-[var(--accent)] transition-all group"
                  >
                    {r.cover_url ? (
                      <img
                        src={r.cover_url}
                        className="w-full aspect-square rounded-lg object-cover mb-3 group-hover:scale-105 transition-transform"
                        alt="Artist"
                      />
                    ) : (
                      <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 mb-3 group-hover:scale-105 transition-transform">
                        🎤
                      </div>
                    )}
                    <p className="font-bold text-sm text-white truncate">
                      {r.artist}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-[var(--accent-text)]">
              <span className="text-2xl">🎵</span> История
            </h2>
            {data.history.length === 0 ? (
              <p className="text-gray-400 font-medium">Тут пока пусто.</p>
            ) : (
              <ul className="space-y-3">
                {data.history.map((item, idx: number) => {
                  const isLatest = idx === 0;
                  const isNowPlaying =
                    isLatest &&
                    (item.is_playing ||
                      (now !== null &&
                        now - Date.parse(item.updated_at + "Z") <
                          15 * 60 * 1000));
                  return (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      isLatest={isLatest}
                      isNowPlaying={isNowPlaying}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {wrapped && wrapped.top_artist !== "Нет данных" && (
            <div className="bg-gradient-to-br from-[var(--accent)]/20 to-black p-6 rounded-2xl border border-[var(--accent)]/30 shadow-[0_0_30px_var(--accent-glow)] relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 blur-3xl rounded-full"></div>
              <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-white">
                <span className="text-xl">📊</span> Итоги месяца
              </h2>
              <div className="space-y-4 relative z-10">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Топ артист
                  </p>
                  <p className="text-lg font-black text-[var(--accent-text)]">
                    {wrapped.top_artist}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Прослушано
                  </p>
                  <p className="text-lg font-black text-white">
                    {wrapped.total_minutes} мин.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/10">
                  <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-black uppercase text-[var(--accent-text)]">
                    {wrapped.status} Listener
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-[var(--accent-text)]">
              <span className="text-xl animate-fire">🔥</span> Топ треков
            </h2>
            <ul className="space-y-3">
              {data.stats.top_tracks?.map((item) => (
                <li
                  key={item.title + item.artist}
                  className="p-2 rounded-xl flex gap-3 items-start transition-all border group relative bg-white/5 border-transparent hover:bg-white/10 hover:border-white/5"
                >
                  <div className="relative w-10 h-10 rounded bg-[#1a1a1a] shrink-0 overflow-hidden shadow-sm mt-0.5">
                    {item.cover_url ? (
                      <img
                        src={item.cover_url}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        alt={item.title}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-sm text-yellow-500/80 shadow-inner">
                        🎵
                      </div>
                    )}
                  </div>
                  <div className="flex-grow min-w-[0] flex flex-col justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="flex items-center gap-2 mb-0.5 w-max">
                      <div className="shrink-0">
                        {getPlatformIcon(item.source)}
                      </div>
                      <a
                        href={getSafeUrl(getTrackUrl(item))}
                        target="_blank"
                        rel="noopener noreferrer"

                        className="font-bold text-sm text-white hover:text-[var(--accent-text)] hover:underline transition-colors whitespace-nowrap pointer-events-auto pr-4"
                      >
                        {item.title}
                      </a>
                    </div>

                    <div className="text-gray-300 text-xs pointer-events-auto whitespace-nowrap pl-[22px] relative z-10 w-max pr-4">
                      {item.artist.split(",").map((a: string) => (
                        <span key={a.trim()}>
                          <a
                            href={getArtistUrl(a.trim(), item.source)}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10 font-medium"
                          >
                            {a.trim()}
                          </a>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs font-black shadow-sm shrink-0 mt-1">
                    {item.plays}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-[var(--accent-text)]">
              <span className="text-xl">🎤</span> Топ артистов
            </h2>
            <ul className="space-y-3">
              {data.stats.top_artists?.map((item) => (
                <li
                  key={item.artist}
                  className="bg-white/5 hover:bg-white/10 p-3 rounded-xl flex justify-between items-start border-l-2 border-[#555] hover:border-[var(--accent)] transition-all group relative"
                >
                  <div className="flex items-center gap-2 min-w-[0] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="shrink-0">
                      {getPlatformIcon(item.source)}
                    </div>
                    <div className="font-bold text-sm text-white pointer-events-auto whitespace-nowrap w-max pr-4">
                      {item.artist.split(",").map((a: string) => (
                        <span key={a.trim()}>
                          <a
                            href={getArtistUrl(a.trim(), item.source)}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10"
                          >
                            {a.trim()}
                          </a>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs font-black shadow-sm shrink-0 mt-0.5">
                    {item.plays}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
