"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarStrip,
  GenreCloud,
  PlatformDistribution,
} from "@/components/StatsCharts";
import { Loading, PageHeader, Segmented } from "@/components/ui";
import { API_URL } from "@/app/lib/api";
import { isValidUser } from "@/app/lib/theme";
import type { DetailedStats } from "@/app/lib/types";
import { StatTiles } from "./_components/StatTiles";
import {
  TopAlbumsCard,
  TopArtistsCard,
  TopTracksCard,
} from "./_components/TopLists";
import { DailyActivity } from "./_components/DailyActivity";

type Period = "7d" | "30d" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё время" },
];

const PERIOD_CAPTION: Record<Period, string> = {
  "7d": "За последние 7 дней",
  "30d": "За последние 30 дней",
  all: "За всё время",
};

function Panel({
  id,
  title,
  aside,
  children,
}: Readonly<{
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {aside && <span className="text-xs text-fg-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

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
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("username");
    setMe(isValidUser(u) ? u : null);
  }, []);

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
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">{error}</h1>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-fg-2 hover:text-fg"
        >
          ← На главную
        </Link>
      </div>
    );
  }

  if (loading || !stats) return <Loading label="Считаем статистику…" />;

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
  const isMine = me !== null && me === username;
  const sortedHours: [string, number][] = Object.entries(hours_activity).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  const peakHour = Object.entries(hours_activity).sort(
    (a, b) => b[1] - a[1],
  )[0];

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        title={
          isMine ? "Статистика" : `Статистика ${user.display_name || username}`
        }
        subtitle={
          <>
            {PERIOD_CAPTION[period]}
            {!isMine && (
              <>
                {" · "}
                <Link href={`/user/${username}`} className="hover:text-fg">
                  @{username}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <Segmented
            label="Период"
            role="radiogroup"
            value={period}
            onChange={setPeriod}
            options={PERIODS}
          />
        }
      />

      <StatTiles
        totalScrobbles={total_scrobbles}
        totalTimeMin={total_time_min}
        uniqueArtists={unique_artists}
        uniqueTracks={unique_tracks}
        avgPerDay={avgPerDay}
        topSource={topSource}
        diversity={diversity}
      />

      <DailyActivity
        activity={activity_graph}
        days={period === "7d" ? 7 : 30}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          id="hours-title"
          title="Когда вы слушаете"
          aside={
            peakHour && peakHour[1] > 0 ? `пик — ${peakHour[0]}:00` : undefined
          }
        >
          <BarStrip data={sortedHours} label="По часам" labelEvery={3} />
        </Panel>
        <Panel id="days-title" title="Дни недели">
          <BarStrip data={days_activity} label="По дням недели" />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="sources-title" title="Источники">
          <PlatformDistribution data={source_counts} />
        </Panel>
        <Panel id="genres-title" title="Жанры">
          <GenreCloud data={genre_counts} />
        </Panel>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <TopArtistsCard artists={top_artists} topSource={topSource} />
        <TopTracksCard tracks={top_tracks} />
        <TopAlbumsCard albums={top_albums} />
      </div>
    </div>
  );
}
