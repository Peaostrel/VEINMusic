"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarStrip,
  GenreCloud,
  PlatformDistribution,
} from "@/components/StatsCharts";
import { Loading, PageHeader, Segmented, inputOnCard } from "@/components/ui";
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
import { MusicCalendar } from "./_components/MusicCalendar";
import { PeriodRecap } from "./_components/PeriodRecap";

type Period = "7d" | "30d" | "90d" | "year" | "all" | "custom";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "Неделя" },
  { id: "30d", label: "Месяц" },
  { id: "90d", label: "Сезон" },
  { id: "year", label: "Год" },
  { id: "all", label: "Всё время" },
  { id: "custom", label: "Даты" },
];

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const [dateTo, setDateTo] = useState(() => isoDate(new Date()));
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return isoDate(date);
  });
  const [hasCheckedFallback, setHasCheckedFallback] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("username");
    setMe(isValidUser(u) ? u : null);
  }, []);

  useEffect(() => {
    if (!username) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ period });
    if (period === "custom") {
      query.set("date_from", dateFrom);
      query.set("date_to", dateTo);
    }
    fetch(`${API_URL}/api/detailed-stats/${username}?${query}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            res.status === 403
              ? "Это приватный профиль"
              : body?.detail || "Не удалось загрузить статистику",
          );
        }
        return (await res.json()) as DetailedStats;
      })
      .then((data) => {
        if (!active) return;
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
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось загрузить статистику",
        );
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [username, period, dateFrom, dateTo, hasCheckedFallback]);

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
            {stats.period.label}
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
          <div className="flex w-[calc(100vw-2rem)] max-w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <Segmented
              label="Период"
              role="radiogroup"
              value={period}
              onChange={setPeriod}
              options={PERIODS}
              className="max-w-full overflow-x-auto"
            />
            {period === "custom" && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-fg-3">
                  С
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className={`${inputOnCard} h-8 w-[142px] font-mono text-xs`}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-fg-3">
                  по
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    max={isoDate(new Date())}
                    onChange={(event) => setDateTo(event.target.value)}
                    className={`${inputOnCard} h-8 w-[142px] font-mono text-xs`}
                  />
                </label>
              </div>
            )}
          </div>
        }
      />

      <PeriodRecap stats={stats} />

      <StatTiles
        totalScrobbles={total_scrobbles}
        totalTimeMin={total_time_min}
        uniqueArtists={unique_artists}
        uniqueTracks={unique_tracks}
        avgPerDay={avgPerDay}
        topSource={topSource}
        diversity={diversity}
      />

      {(["7d", "30d", "90d"] as Period[]).includes(period) && (
        <DailyActivity
          activity={activity_graph}
          days={period === "7d" ? 7 : period === "30d" ? 30 : 90}
          endDate={stats.period.end}
        />
      )}

      <MusicCalendar username={String(username)} />

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
