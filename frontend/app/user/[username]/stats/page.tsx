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
import { API_URL } from "@/app/lib/api";
import type { DetailedStats } from "@/app/lib/types";
import { StatTiles } from "./_components/StatTiles";
import {
  TopAlbumsCard,
  TopArtistsCard,
  TopTracksCard,
} from "./_components/TopLists";
import { DailyActivity } from "./_components/DailyActivity";

type Period = "7d" | "30d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 Дней",
  "30d": "30 Дней",
  all: "Всё время",
};

const noData = (
  <div className="h-36 flex items-center justify-center text-gray-400 text-sm font-bold bg-white/5 rounded-xl">
    Нет данных
  </div>
);

/** Platform the user's top tracks were mostly played on. */
function mostUsedSource(tracks: DetailedStats["top_tracks"]): string {
  const counts: Record<string, number> = {};
  for (const t of tracks) counts[t.source] = (counts[t.source] || 0) + t.plays;
  return (
    Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "yandex"
  );
}

export default function DetailedStatsPage() {
  const username = useParams()?.username;
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const [hasCheckedFallback, setHasCheckedFallback] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetch(`${API_URL}/api/detailed-stats/${username}?period=${period}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          setError(
            res.status === 403
              ? "Это приватный профиль"
              : "Не удалось загрузить статистику",
          );
          return null;
        }
        return (await res.json()) as DetailedStats;
      })
      .then((data) => {
        if (!data) {
          setLoading(false);
          return;
        }
        if (
          period === "30d" &&
          data.total_scrobbles === 0 &&
          !hasCheckedFallback
        ) {
          // Nothing in the last 30 days on the first load: show all time
          setHasCheckedFallback(true);
          setPeriod("all");
        } else {
          setStats(data);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [username, period, hasCheckedFallback]);

  if (error) {
    return (
      <div className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-2xl">
        {error}
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <output className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-2xl animate-pulse">
        Сбор данных...
      </output>
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
    activity_graph = {},
    hours_activity = {},
    days_activity = {},
    genre_counts = {},
    source_counts = {},
  } = stats;

  const topSource = mostUsedSource(top_tracks);
  let daysDivider = Math.max(Object.keys(activity_graph).length, 1);
  if (period === "7d") daysDivider = 7;
  else if (period === "30d") daysDivider = 30;
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
              alt={`Аватар ${username}`}
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

        <fieldset className="flex bg-[#121212]/80 backdrop-blur-md rounded-xl p-1 border border-white/5 shadow-lg">
          <legend className="sr-only">Период</legend>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${period === p ? "bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]" : "text-gray-300 hover:text-white"}`}
              style={
                period === p ? { color: "var(--text-on-accent)" } : undefined
              }
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </fieldset>
      </div>

      <StatTiles
        totalScrobbles={total_scrobbles}
        totalTimeMin={total_time_min}
        uniqueArtists={unique_artists}
        uniqueTracks={unique_tracks}
        avgPerDay={avgPerDay}
        topSource={topSource}
      />

      <section className="bg-[#121212]/70 p-6 rounded-2xl shadow-xl border border-white/5 mb-8">
        <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
          <h2 className="text-xl font-black text-[var(--accent-text)] flex items-center gap-2">
            <span aria-hidden="true">📊</span> Детальная аналитика
          </h2>
          <div className="text-right">
            <div className="text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              {diversity}%
            </div>
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">
              Индекс разнообразия
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
          <div>
            <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Clock className="w-3 h-3" aria-hidden="true" /> Время суток
            </h3>
            {Object.keys(hours_activity).length > 0 ? (
              <ActivityBarChart data={hours_activity} color="var(--accent)" />
            ) : (
              noData
            )}
          </div>
          <div>
            <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <CalendarDays className="w-3 h-3" aria-hidden="true" /> Дни недели
            </h3>
            {Object.keys(days_activity).length > 0 ? (
              <ActivityBarChart data={days_activity} color="#fff" />
            ) : (
              noData
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <section className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            <Award
              className="w-5 h-5 text-[var(--accent)]"
              aria-hidden="true"
            />{" "}
            Музыкальное ДНК
          </h2>
          <div className="min-h-[200px] flex items-center justify-center">
            <GenreCloud data={genre_counts} />
          </div>
        </section>

        <section className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            <PieChart
              className="w-5 h-5 text-[var(--accent)]"
              aria-hidden="true"
            />{" "}
            Распределение платформ
          </h2>
          <PlatformDistribution data={source_counts} />
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <TopTracksCard tracks={top_tracks} />
        <TopArtistsCard artists={top_artists} topSource={topSource} />
        <TopAlbumsCard albums={top_albums} />
      </div>

      <DailyActivity activity={activity_graph} />
    </div>
  );
}
