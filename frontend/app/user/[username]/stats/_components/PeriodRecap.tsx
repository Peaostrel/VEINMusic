"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Share2 } from "lucide-react";
import Dialog from "@/components/Dialog";
import { LogoTile, Wordmark } from "@/components/brand";
import { Meter, btn } from "@/components/ui";
import type { DetailedStats } from "@/app/lib/types";
import { formatNumber } from "@/app/lib/plural";

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

function Change({ value }: Readonly<{ value: number }>) {
  if (value === 0) return <span className="text-fg-3">без изменений</span>;
  const positive = value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={positive ? "text-ok" : "text-fg-3"}>
      <Icon className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
      {Math.abs(value)}%
    </span>
  );
}

function RecapCard({ stats }: Readonly<{ stats: DetailedStats }>) {
  const artists = stats.top_artists.slice(0, 5);
  const max = artists[0]?.plays || 1;
  return (
    <div className="flex h-[640px] w-[360px] max-w-full flex-col justify-between rounded-2xl border border-line bg-surface p-7">
      <header>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
          VEIN Wrapped
        </span>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          {stats.period.label}
        </h2>
        <p className="mt-2 text-sm text-fg-2">@{stats.user.username}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <dt className="text-xs text-fg-3">прослушиваний</dt>
          <dd className="font-mono text-3xl">
            {formatNumber(stats.total_scrobbles)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">минут музыки</dt>
          <dd className="font-mono text-3xl">
            {formatNumber(stats.total_time_min)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">артистов</dt>
          <dd className="font-mono text-2xl">
            {formatNumber(stats.unique_artists)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">новых артистов</dt>
          <dd className="font-mono text-2xl">
            {formatNumber(stats.new_artists)}
          </dd>
        </div>
      </dl>

      <section>
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-3">
          Главные артисты
        </h3>
        <ol className="flex flex-col gap-3">
          {artists.map((artist, index) => (
            <li
              key={artist.name}
              className="grid grid-cols-[16px_minmax(0,1fr)_38px] items-center gap-2"
            >
              <span className="font-mono text-xs text-fg-3">{index + 1}</span>
              <span className="min-w-0">
                <span className="mb-1 block truncate text-sm">
                  {artist.name}
                </span>
                <Meter value={artist.plays} max={max} accent={index === 0} />
              </span>
              <span className="text-right font-mono text-xs text-fg-2">
                {artist.plays}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="flex items-center justify-center gap-2">
        <LogoTile size={22} />
        <Wordmark className="text-sm" />
      </footer>
    </div>
  );
}

export function PeriodRecap({ stats }: Readonly<{ stats: DetailedStats }>) {
  const [sharing, setSharing] = useState(false);
  const topArtist = stats.top_artists[0];
  const comparison = stats.comparison?.change;
  return (
    <>
      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-col gap-5 border-b border-line-soft p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
              VEIN Wrapped
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">
              Итоги периода
            </h2>
            <p className="mt-1 text-sm text-fg-2">{stats.period.label}</p>
          </div>
          <button
            type="button"
            onClick={() => setSharing(true)}
            className={`${btn.secondary} ${btn.sm}`}
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Карточка
          </button>
        </div>

        <div className="grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["прослушиваний", stats.total_scrobbles, comparison?.scrobbles],
            ["минут музыки", stats.total_time_min, comparison?.minutes],
            ["артистов", stats.unique_artists, comparison?.artists],
            ["треков", stats.unique_tracks, comparison?.tracks],
          ].map(([label, value, change]) => (
            <div key={label} className="bg-surface p-5">
              <p className="text-xs text-fg-3">{label}</p>
              <p className="mt-1 font-mono text-2xl">
                {formatNumber(Number(value))}
              </p>
              {typeof change === "number" && (
                <p className="mt-1 text-[11px]">
                  <Change value={change} />
                  <span className="ml-1 text-fg-3">к прошлому периоду</span>
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-fg-3">Артист периода</p>
            <p className="mt-1 truncate text-base font-medium">
              {topArtist?.name ?? "Нет данных"}
            </p>
            {topArtist && (
              <p className="font-mono text-xs text-fg-2">
                {topArtist.plays} прослушиваний
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-fg-3">Новые артисты</p>
            <p className="mt-1 font-mono text-2xl">{stats.new_artists}</p>
          </div>
          <div>
            <p className="text-xs text-fg-3">Самый активный день</p>
            <p className="mt-1 text-base font-medium">
              {stats.peak_day ? prettyDate(stats.peak_day.date) : "Нет данных"}
            </p>
            {stats.peak_day && (
              <p className="font-mono text-xs text-fg-2">
                {stats.peak_day.scrobbles} прослушиваний
              </p>
            )}
          </div>
        </div>
      </section>

      {sharing && (
        <Dialog
          label="Карточка итогов"
          onClose={() => setSharing(false)}
          className="overflow-y-auto py-8"
        >
          <div className="my-auto flex flex-col items-center gap-4">
            <RecapCard stats={stats} />
            <p className="text-center text-xs text-fg-3">
              Сделайте скриншот и поделитесь итогами
            </p>
            <button
              type="button"
              onClick={() => setSharing(false)}
              className={`${btn.secondary} ${btn.md}`}
            >
              Закрыть
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
