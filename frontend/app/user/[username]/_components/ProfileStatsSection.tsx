"use client";

import {
  getArtistUrl,
  getTrackUrl,
  SocialIcons,
  getCountryCode,
  getNetworkLabel,
} from "./profileUtils";

export interface ProfileStatsSectionProps {
  u: any;
  progressPercent: number;
  xpInCurrentLevel: number;
  nextRank: any;
  taste: any;
  socialLinks: any[];
  countries: any[];
  favoriteAlbumRedirectUrl: string;
}

export function ProfileStatsSection({
  u,
  progressPercent,
  xpInCurrentLevel,
  nextRank,
  taste,
  socialLinks,
  countries,
  favoriteAlbumRedirectUrl,
}: Readonly<ProfileStatsSectionProps>) {
  return (
    <div className="px-6 md:px-10 pb-8">
      <div className="max-w-md bg-[#121212]/50 p-3 rounded-xl border border-white/5 backdrop-blur-sm mb-5 shadow-lg mx-auto md:mx-0">
        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            {nextRank ? (
              <>
                До ранга{" "}
                <span className="text-[var(--accent)]">{nextRank.name}</span>
              </>
            ) : (
              "Максимальный ранг"
            )}
          </span>
          <span>
            {xpInCurrentLevel} / 100 XP
            {u.streak >= 7 && (
              <span
                className="text-orange-400 ml-1 font-black"
                title="Стрик 7+ дней дает +10% опыта!"
              >
                <span className="animate-fire">🔥</span> +10%
              </span>
            )}
          </span>
        </div>
        <div className="w-full bg-black/80 h-3 rounded-full overflow-hidden border border-white/10">
          <div
            className="bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow-strong)] h-full relative transition-all duration-1000"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
          </div>
        </div>
      </div>

      {taste?.match !== undefined && (
        <div className="inline-flex items-center gap-3 bg-[#1DB954]/10 border border-[#1DB954]/40 px-4 py-2 rounded-lg mb-5 shadow-lg backdrop-blur-sm hover:scale-105 transition-transform">
          <span className="text-2xl drop-shadow-[0_0_5px_#1DB954] animate-fire">
            🔥
          </span>
          <div className="text-left">
            <p className="text-[10px] text-[#1DB954] font-bold uppercase tracking-wider">
              Совместимость вкусов
            </p>
            <p className="text-white font-bold text-sm">
              {taste.match}%
              <span className="text-gray-400 font-normal text-xs ml-1">
                (
                {taste.common_artists?.length > 0
                  ? taste.common_artists.join(", ")
                  : "пока нет общих"}
                )
              </span>
            </p>
          </div>
        </div>
      )}

      {socialLinks.length > 0 && (
        <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-6">
          {socialLinks.map((link: any) => {
            return (
              <a
                key={link.id}
                href={
                  link.network.toLowerCase() === "telegram"
                    ? `https://t.me/${link.username}`
                    : `https://${link.network}.com/${link.username}`
                }
                target="_blank"
                rel="noopener noreferrer"

                className="flex items-center gap-2 bg-[#121212]/50 hover:bg-[var(--accent)] hover:text-[var(--text-on-accent)] text-white px-4 py-2 rounded-lg text-sm transition-all border border-white/5 hover:border-transparent backdrop-blur-sm shadow-md group"
              >
                {SocialIcons[link.network as keyof typeof SocialIcons]}
                <span className="font-bold">
                  {getNetworkLabel(link.network)}
                </span>
              </a>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-8">
        {u.location &&
          (() => {
            const parts = u.location.split(",").map((s: string) => s.trim());
            const countryName = parts[0] || "";
            const cityName = parts[1] || "";
            const code = getCountryCode(countryName, countries);
            const flagUrl = code
              ? `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.0/flags/4x3/${code.toLowerCase()}.svg`
              : null;

            return (
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
                <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full overflow-hidden bg-white/5 group-hover:scale-110 transition-transform">
                  {flagUrl ? (
                    <img
                      src={flagUrl}
                      alt={countryName}
                      className="w-full h-full object-cover shadow-sm scale-110"
                    />
                  ) : (
                    <span className="text-xl">📍</span>
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">
                    Местоположение
                  </span>
                  <span className="text-sm font-bold text-white leading-none tracking-wide">
                    {countryName}
                    {cityName ? `, ${cityName}` : ""}
                  </span>
                </div>
              </div>
            );
          })()}
        {u.favorite_genre && (
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
            <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
              🎧
            </span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">
                Жанр
              </span>
              <span className="text-sm font-bold text-white leading-none tracking-wide">
                {u.favorite_genre}
              </span>
            </div>
          </div>
        )}
        {u.equipment && (
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
            <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
              🔊
            </span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">
                Аппаратура
              </span>
              <span className="text-sm font-bold text-white leading-none tracking-wide">
                {u.equipment}
              </span>
            </div>
          </div>
        )}
      </div>

      {(u.favorite_artist || u.favorite_track || u.favorite_album) && (
        <div className="mt-8 pt-6 border-t border-white/5 text-left">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            Музыкальная витрина
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {u.favorite_artist && (
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 transition-all duration-500 shadow-xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-4">
                  {u.favorite_artist_cover ? (
                    <img
                      src={u.favorite_artist_cover}
                      className="w-20 h-20 rounded-full object-cover shadow-lg shrink-0"
                      alt="Artist"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 shadow-inner shrink-0">
                      🎤
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full border border-cyan-400/20 mb-1.5">
                      Артист
                    </span>
                    <a
                      href={
                        u.favorite_artist_url && u.favorite_artist_url !== "#"
                          ? u.favorite_artist_url
                          : getArtistUrl(u.favorite_artist, "yandex")
                      }
                      target="_blank"
                      rel="noopener noreferrer"

                      className="block font-black text-white hover:text-[var(--accent-text)] text-base leading-tight break-words"
                    >
                      {u.favorite_artist}
                    </a>
                    {u.favorite_artist_rating > 0 && (
                      <div
                        className="flex items-center gap-0.5 mt-2"
                        title={`Оценка: ${u.favorite_artist_rating}/5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= u.favorite_artist_rating
                                ? "text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]"
                                : "text-gray-700"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {u.favorite_artist_review && (
                  <p className="text-xs text-gray-300 italic bg-black/40 p-3 rounded-xl border-l-2 border-cyan-400 leading-relaxed max-h-32 overflow-y-auto pr-2">
                    &ldquo;{u.favorite_artist_review}&rdquo;
                  </p>
                )}
              </div>
            )}

            {u.favorite_track && (
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 transition-all duration-500 shadow-xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-4">
                  {u.favorite_track_cover ? (
                    <img
                      src={u.favorite_track_cover}
                      className="w-20 h-20 rounded-xl object-cover shadow-lg shrink-0"
                      alt="Track"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 shadow-inner shrink-0">
                      🎵
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full border border-purple-400/20 mb-1.5">
                      Трек
                    </span>
                    <a
                      href={
                        u.favorite_track_url && u.favorite_track_url !== "#"
                          ? u.favorite_track_url
                          : getTrackUrl({
                              artist: u.favorite_artist || "",
                              title: u.favorite_track,
                              source: "yandex",
                            })
                      }
                      target="_blank"
                      rel="noopener noreferrer"

                      className="block font-black text-white hover:text-[var(--accent-text)] text-base leading-tight break-words"
                    >
                      {u.favorite_track}
                    </a>
                    {u.favorite_track_rating > 0 && (
                      <div
                        className="flex items-center gap-0.5 mt-2"
                        title={`Оценка: ${u.favorite_track_rating}/5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= u.favorite_track_rating
                                ? "text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]"
                                : "text-gray-700"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {u.favorite_track_review && (
                  <p className="text-xs text-gray-300 italic bg-black/40 p-3 rounded-xl border-l-2 border-purple-400 leading-relaxed max-h-32 overflow-y-auto pr-2">
                    &ldquo;{u.favorite_track_review}&rdquo;
                  </p>
                )}
              </div>
            )}

            {u.favorite_album && (
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 transition-all duration-500 shadow-xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-4">
                  {u.favorite_album_cover ? (
                    <img
                      src={u.favorite_album_cover}
                      className="w-20 h-20 rounded-xl object-cover shadow-lg shrink-0"
                      alt="Album"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 shadow-inner shrink-0">
                      💿
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 mb-1.5">
                      Альбом
                    </span>
                    <a
                      href={favoriteAlbumRedirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"

                      className="block font-black text-white hover:text-[var(--accent-text)] text-base leading-tight break-words"
                    >
                      {u.favorite_album}
                    </a>
                    {u.favorite_album_rating > 0 && (
                      <div
                        className="flex items-center gap-0.5 mt-2"
                        title={`Оценка: ${u.favorite_album_rating}/5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= u.favorite_album_rating
                                ? "text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]"
                                : "text-gray-700"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {u.favorite_album_review && (
                  <p className="text-xs text-gray-300 italic bg-black/40 p-3 rounded-xl border-l-2 border-amber-400 leading-relaxed max-h-32 overflow-y-auto pr-2">
                    &ldquo;{u.favorite_album_review}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
