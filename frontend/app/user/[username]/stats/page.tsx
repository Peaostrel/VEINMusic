"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PlatformDistribution,
  GenreCloud,
  ActivityBarChart,
} from "@/components/StatsCharts";
import { PieChart, Clock, CalendarDays, Award } from "lucide-react";
import { getPlatformIcon } from "../../../../utils/formatters";

const getArtistUrl = (artist: string, source: string) => {
  if (!artist) return "#";
  const q = encodeURIComponent(artist);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${q}/artists`;
    case "vk":
      return `https://vk.com/audio?q=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "soundcloud":
      return `https://soundcloud.com/search/people?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    case "yandex":
      return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/redirect?source=yandex&type=artist&q=${q}`;
    default:
      return "#";
  }
};

const getAlbumUrl = (album: string, artist: string, source: string) => {
  if (!album) return "#";
  const q = encodeURIComponent(`${artist} ${album}`);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${q}/albums`;
    case "vk":
      return `https://vk.com/audio?q=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "soundcloud":
      return `https://soundcloud.com/search/albums?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    case "yandex":
      return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/redirect?source=yandex&type=album&q=${q}`;
    default:
      return "#";
  }
};

const getTrackUrl = (t: any) => {
  if (t.source === "yandex" && !t.track_url?.includes("/track/")) {
    return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/redirect?source=yandex&type=track&q=${encodeURIComponent(t.artist + " " + (t.title || ""))}`;
  }
  return t.track_url || "#";
};

const PERIOD_LABELS: Record<string, string> = {
  "7d": "7 Дней",
  "30d": "30 Дней",
  all: "Всё время",
};

export default function DetailedStats() {
  const username = useParams()?.username;
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [hasCheckedFallback, setHasCheckedFallback] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/detailed-stats/${username}?period=${period}`,
      { credentials: "include", cache: "no-store" },
    )
      .then((res) => res.json())
      .then((data) => {
        if (
          period === "30d" &&
          data.total_scrobbles === 0 &&
          !hasCheckedFallback
        ) {
          // Если при первой загрузке за последние 30 дней пусто, переключимся на "всё время"
          setHasCheckedFallback(true);
          setPeriod("all");
        } else {
          setStats(data);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [username, period, hasCheckedFallback]);

  if (loading || !stats) {
    return (
      <div className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-2xl animate-pulse">
        Сбор данных...
      </div>
    );
  }

  const {
    user,
    total_time_min,
    total_scrobbles,
    unique_artists,
    unique_tracks,
    top_artists,
    top_tracks,
    top_albums = [],
    activity_graph,
    hours_activity,
    days_activity,
    genre_counts = {},
    source_counts = {},
  } = stats;

  const hours = Math.floor(total_time_min / 60);
  const minutes = total_time_min % 60;

  const maxActivity = Math.max(
    ...Object.values(activity_graph || {}).map(Number),
    1,
  );

  // Генерируем последние 14 непрерывных дней для честного графика
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(
      d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0"),
    );
  }

  const sourceCounts = top_tracks.reduce((acc: any, t: any) => {
    acc[t.source] = (acc[t.source] || 0) + t.plays;
    return acc;
  }, {});
  const topSource =
    Object.keys(sourceCounts).sort(
      (a, b) => sourceCounts[b] - sourceCounts[a],
    )[0] || "yandex";
  const sourceNames: any = {
    spotify: "Spotify",
    yandex: "Яндекс Музыка",
    vk: "ВКонтакте",
    youtube_music: "YouTube Music",
    soundcloud: "SoundCloud",
    apple_music: "Apple Music",
    lastfm: "Last.fm",
  };

  let daysDivider = 1;
  if (period === "7d") {
    daysDivider = 7;
  } else if (period === "30d") {
    daysDivider = 30;
  } else {
    daysDivider = Math.max(Object.keys(activity_graph || {}).length, 1);
  }
  const avgPerDay = Math.round(total_scrobbles / daysDivider);

  const diversity =
    total_scrobbles > 0
      ? Math.round((unique_tracks / total_scrobbles) * 100)
      : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 pt-24 pb-20 overflow-x-hidden">
      <Link
        href={`/user/${username}`}
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 font-bold"
      >
        ← Назад в профиль
      </Link>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-4">
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/10 shadow-[0_0_20px_var(--accent-glow)] shrink-0 group">
            <img
              src={
                user.avatar_url ||
                `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`
              }
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              alt="Avatar"
            />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
              Музыкальная карта
            </h1>
            <p className="text-[var(--accent-text)] font-bold text-lg">
              @{username}
            </p>
          </div>
        </div>

        <div className="flex bg-[#121212]/80 backdrop-blur-md rounded-xl p-1 border border-white/5 shadow-lg">
          {["7d", "30d", "all"].map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${period === p ? "bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]" : "text-gray-400 hover:text-white"}`}
              style={
                period === p ? { color: "var(--text-on-accent)" } : undefined
              }
            >
              {PERIOD_LABELS[p] || "Всё время"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:flex lg:flex-row gap-4 mb-8 overflow-x-auto pb-4 custom-scrollbar">
        <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
            Прослушано
          </div>
          <div className="text-2xl font-black text-white whitespace-nowrap">
            {total_scrobbles}{" "}
            <span className="text-xs font-normal text-gray-500">тр.</span>
          </div>
        </div>
        <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
            Чистое время
          </div>
          <div className="text-2xl font-black text-[var(--accent-text)] whitespace-nowrap">
            {hours}
            <span className="text-xs font-normal text-gray-500 mx-1">ч</span>
            {minutes}
            <span className="text-xs font-normal text-gray-500 ml-1">м</span>
          </div>
        </div>
        <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
            Артистов
          </div>
          <div className="text-2xl font-black text-white whitespace-nowrap">
            {unique_artists}
          </div>
        </div>
        <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
            Уник. треков
          </div>
          <div className="text-2xl font-black text-white whitespace-nowrap">
            {unique_tracks}
          </div>
        </div>
        <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
            В среднем в день
          </div>
          <div className="text-2xl font-black text-white whitespace-nowrap">
            {avgPerDay}{" "}
            <span className="text-xs font-normal text-gray-500">тр.</span>
          </div>
        </div>
        <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
            Главная платформа
          </div>
          <div className="text-sm font-black text-[var(--accent-text)] flex items-center gap-2 mt-1 whitespace-nowrap">
            {getPlatformIcon(topSource)}{" "}
            <span>{sourceNames[topSource] || topSource}</span>
          </div>
        </div>
      </div>

      <div className="bg-[#121212]/70 p-6 rounded-2xl shadow-xl border border-white/5 mb-8">
        <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
          <h2 className="text-xl font-black text-[var(--accent-text)] flex items-center gap-2">
            📊 Детальная аналитика
          </h2>
          <div className="text-right">
            <div className="text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              {diversity}%
            </div>
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
              Индекс разнообразия
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
          <div>
            <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Clock className="w-3 h-3" /> Время суток
            </h3>
            {Object.keys(hours_activity || {}).length > 0 ? (
              <ActivityBarChart data={hours_activity} color="var(--accent)" />
            ) : (
              <div className="h-36 flex items-center justify-center text-gray-600 text-sm font-bold bg-white/5 rounded-xl">
                Нет данных
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <CalendarDays className="w-3 h-3" /> Дни недели
            </h3>
            {Object.keys(days_activity || {}).length > 0 ? (
              <ActivityBarChart data={days_activity} color="#fff" />
            ) : (
              <div className="h-36 flex items-center justify-center text-gray-600 text-sm font-bold bg-white/5 rounded-xl">
                Нет данных
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-[var(--accent)]" /> Музыкальное ДНК
          </h2>
          <div className="min-h-[200px] flex items-center justify-center">
            <GenreCloud data={genre_counts} />
          </div>
        </div>

        <div className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-[var(--accent)]" /> Распределение
            платформ
          </h2>
          <PlatformDistribution data={source_counts} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            🔥 Топ треков
          </h2>
          <div className="space-y-4">
            {top_tracks.length === 0 ? (
              <p className="text-gray-500">Нет данных</p>
            ) : (
              top_tracks.map((t: any, i: number) => {
                const width = (t.plays / top_tracks[0].plays) * 100;
                return (
                  <div
                    key={`${t.title}-${t.artist}-${t.source}`}
                    className="relative group"
                  >
                    <div className="flex items-start gap-3 relative z-10 p-2 border border-transparent hover:border-white/5 rounded-xl transition-colors">
                      <span className="text-gray-500 font-bold w-4 text-right shrink-0 mt-2">
                        {i + 1}
                      </span>
                      {t.cover_url ? (
                        <img
                          src={t.cover_url}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded shadow-sm object-cover shrink-0 mt-0.5"
                          alt="cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-sm text-yellow-500/80 shadow-sm shrink-0 mt-0.5">
                          🎵
                        </div>
                      )}
                      <div className="flex-grow min-w-0">
                        <div className="flex items-start gap-1.5 mb-0.5">
                          <div className="mt-1 shrink-0">
                            {getPlatformIcon(t.source)}
                          </div>
                          <a
                            href={getTrackUrl(t)}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="font-bold text-white text-sm hover:text-[var(--accent-text)] hover:underline transition-colors break-words leading-tight"
                          >
                            {t.title}
                          </a>
                        </div>
                        <div className="text-xs text-gray-400 pointer-events-auto break-words pl-[22px]">
                          {t.artist
                            .split(",")
                            .map((a: string, idx: number, arr: string[]) => (
                              <span key={a.trim()}>
                                <a
                                  href={getArtistUrl(a.trim(), t.source)}
                                  target="_blank"
                                  rel="noopener noreferrer"

                                  className="hover:text-[var(--accent-text)] hover:underline transition-colors font-medium"
                                >
                                  {a.trim()}
                                </a>
                                {idx < arr.length - 1 ? ", " : ""}
                              </span>
                            ))}
                        </div>
                      </div>
                      <span className="font-black text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs shadow-sm shrink-0 mt-1">
                        {t.plays}
                      </span>
                    </div>
                    <div
                      className="absolute top-0 left-0 h-full bg-[var(--accent)]/10 rounded-xl transition-all duration-1000 -z-0"
                      style={{ width: `${width}%` }}
                    ></div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            🎤 Топ артистов
          </h2>
          <div className="space-y-4">
            {top_artists.length === 0 ? (
              <p className="text-gray-500">Нет данных</p>
            ) : (
              top_artists.map((a: any, i: number) => {
                const width = (a.plays / top_artists[0].plays) * 100;
                return (
                  <div key={`${a.name}-${a.source}`} className="relative group">
                    <div className="flex items-start gap-3 relative z-10 p-2 py-3 border border-transparent hover:border-white/5 rounded-xl transition-colors">
                      <span className="text-gray-500 font-bold w-4 text-right shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-grow min-w-0 pointer-events-auto">
                        <div className="flex items-start gap-1.5 mb-0.5">
                          <div className="mt-0.5 shrink-0">
                            {getPlatformIcon(a.source)}
                          </div>
                          <a
                            href={getArtistUrl(a.name, topSource)}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="font-bold text-white text-sm hover:text-[var(--accent-text)] hover:underline transition-colors break-words"
                          >
                            {a.name}
                          </a>
                        </div>
                      </div>
                      <span className="font-black text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs shadow-sm shrink-0 mt-0.5">
                        {a.plays}
                      </span>
                    </div>
                    <div
                      className="absolute top-0 left-0 h-full bg-[var(--accent)]/10 rounded-xl transition-all duration-1000 -z-0"
                      style={{ width: `${width}%` }}
                    ></div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            💿 Топ альбомов
          </h2>
          <div className="space-y-4">
            {top_albums.length === 0 ? (
              <p className="text-gray-500">Нет данных</p>
            ) : (
              top_albums.map((album: any, i: number) => {
                const width = (album.plays / top_albums[0].plays) * 100;
                return (
                  <div
                    key={`${album.album || album.title || album.name}-${album.artist}-${album.source}`}
                    className="relative group"
                  >
                    <div className="flex items-start gap-3 relative z-10 p-2 py-3 border border-transparent hover:border-white/5 rounded-xl transition-colors">
                      <span className="text-gray-500 font-bold w-4 text-right shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {album.cover_url && (
                        <img
                          src={album.cover_url}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="w-10 h-10 rounded object-cover shadow-sm shrink-0"
                          alt="cover"
                        />
                      )}
                      <div className="flex-grow min-w-0 pointer-events-auto">
                        <div className="flex items-start gap-1.5 mb-0.5">
                          <div className="mt-0.5 shrink-0">
                            {getPlatformIcon(album.source)}
                          </div>
                          <a
                            href={getAlbumUrl(
                              album.album || album.title || album.name,
                              album.artist,
                              album.source,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="font-bold text-white text-sm hover:text-[var(--accent-text)] hover:underline transition-colors break-words leading-tight"
                          >
                            {album.album || album.title || album.name}
                          </a>
                        </div>
                        {album.artist && (
                          <div className="text-xs text-gray-400 pointer-events-auto break-words pl-[22px]">
                            {album.artist
                              .split(",")
                              .map((a: string, idx: number, arr: string[]) => (
                                <span key={a.trim()}>
                                  <a
                                    href={getArtistUrl(a.trim(), album.source)}
                                    target="_blank"
                                    rel="noopener noreferrer"

                                    className="hover:text-[var(--accent-text)] hover:underline transition-colors font-medium"
                                  >
                                    {a.trim()}
                                  </a>
                                  {idx < arr.length - 1 ? ", " : ""}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      <span className="font-black text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs shadow-sm shrink-0 mt-0.5">
                        {album.plays}
                      </span>
                    </div>
                    <div
                      className="absolute top-0 left-0 h-full bg-[var(--accent)]/10 rounded-xl transition-all duration-1000 -z-0"
                      style={{ width: `${width}%` }}
                    ></div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
        <h2 className="text-xl font-black text-white mb-6">
          📈 Активность (последние 14 дней)
        </h2>
        <div className="h-40 flex items-end gap-2">
          {dates.length === 0 ? (
            <p className="text-gray-500">Нет данных</p>
          ) : (
            dates.map((date: string) => {
              const count = activity_graph[date] || 0;
              const height = (count / maxActivity) * 100;
              const dayLabel = new Date(date).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
              });

              return (
                <div
                  key={date}
                  className="flex-1 flex flex-col justify-end items-center group relative h-full"
                >
                  <div className="absolute -top-8 opacity-0 group-hover:opacity-100 bg-[#222] text-white text-xs px-2 py-1 rounded transition-opacity border border-white/10 shadow-lg">
                    {count}
                  </div>
                  <div
                    className="w-full bg-[var(--accent)]/20 hover:bg-[var(--accent)]/50 rounded-t-sm transition-all duration-300 relative"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-[var(--accent)] rounded-t-sm"></div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-2 font-mono">
                    {dayLabel}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
