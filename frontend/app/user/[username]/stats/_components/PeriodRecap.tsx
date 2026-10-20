"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Share2 } from "lucide-react";
import Dialog from "@/components/Dialog";
import { LogoTile, Wordmark } from "@/components/brand";
import { Meter, btn } from "@/components/ui";
import type { DetailedStats, UserPreferences } from "@/app/lib/types";
import { formatNumber } from "@/app/lib/plural";
import { msg } from "@/app/lib/i18n/core";
import { currentLocale } from "@/app/lib/i18n/active";
import { useT } from "@/app/lib/i18n/client";
import { periodLabel } from "./links";

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(currentLocale(), {
    day: "numeric",
    month: "long",
  });
}

function Change({ value }: Readonly<{ value: number | null }>) {
  const t = useT();
  if (value === null)
    return <span className="text-ok">{t("новая активность")}</span>;
  if (value === 0)
    return <span className="text-fg-3">{t("без изменений")}</span>;
  const positive = value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={positive ? "text-ok" : "text-fg-3"}>
      <Icon className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
      {Math.abs(value)}%
    </span>
  );
}

function RecapCard({
  stats,
  preferences,
}: Readonly<{
  stats: DetailedStats;
  preferences: UserPreferences["wrapped"];
}>) {
  const t = useT();
  const artists = stats.top_artists.slice(0, 5);
  const max = artists[0]?.plays || 1;
  const backgrounds: Record<UserPreferences["wrapped"]["card_style"], string> =
    {
      minimal: "bg-bg",
      vivid:
        "bg-[linear-gradient(160deg,var(--accent-glow-strong),var(--color-surface)_45%)]",
      classic: "bg-surface",
    };
  const background = backgrounds[preferences.card_style] ?? "bg-surface";
  return (
    <div
      className={`flex h-[640px] w-[360px] max-w-full flex-col justify-between rounded-2xl border border-line p-7 ${background}`}
    >
      <header>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
          VEIN Wrapped
        </span>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          {periodLabel(stats.period)}
        </h2>
        <p className="mt-2 text-sm text-fg-2">
          {preferences.identity === "display_name"
            ? stats.user.display_name
            : `@${stats.user.username}`}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <dt className="text-xs text-fg-3">{t("прослушиваний")}</dt>
          <dd className="font-mono text-3xl">
            {formatNumber(stats.total_scrobbles)}
          </dd>
        </div>
        {preferences.show_minutes && (
          <div>
            <dt className="text-xs text-fg-3">{t("минут музыки")}</dt>
            <dd className="font-mono text-3xl">
              {formatNumber(stats.total_time_min)}
            </dd>
          </div>
        )}
        {preferences.show_artists && (
          <div>
            <dt className="text-xs text-fg-3">{t("артистов")}</dt>
            <dd className="font-mono text-2xl">
              {formatNumber(stats.unique_artists)}
            </dd>
          </div>
        )}
        {preferences.show_tracks && (
          <div>
            <dt className="text-xs text-fg-3">{t("треков")}</dt>
            <dd className="font-mono text-2xl">
              {formatNumber(stats.unique_tracks)}
            </dd>
          </div>
        )}
        {preferences.show_new_artists && (
          <div>
            <dt className="text-xs text-fg-3">{t("новых артистов")}</dt>
            <dd className="font-mono text-2xl">
              {formatNumber(stats.new_artists)}
            </dd>
          </div>
        )}
      </dl>

      <section>
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-3">
          {t("Главные артисты")}
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

export function PeriodRecap({
  stats,
  preferences,
}: Readonly<{
  stats: DetailedStats;
  preferences: UserPreferences["wrapped"];
}>) {
  const t = useT();
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
              {t("Итоги периода")}
            </h2>
            <p className="mt-1 text-sm text-fg-2">
              {periodLabel(stats.period)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSharing(true)}
            className={`${btn.secondary} ${btn.sm}`}
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Карточка")}
          </button>
        </div>

        <div className="grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              msg("прослушиваний"),
              stats.total_scrobbles,
              comparison?.scrobbles,
            ],
            preferences.show_minutes
              ? [msg("минут музыки"), stats.total_time_min, comparison?.minutes]
              : null,
            preferences.show_artists
              ? [msg("артистов"), stats.unique_artists, comparison?.artists]
              : null,
            preferences.show_tracks
              ? [msg("треков"), stats.unique_tracks, comparison?.tracks]
              : null,
          ]
            .filter((item): item is (string | number | null | undefined)[] =>
              Boolean(item),
            )
            .map(([label, value, change]) => (
              <div key={label} className="bg-surface p-5">
                <p className="text-xs text-fg-3">{t(String(label))}</p>
                <p className="mt-1 font-mono text-2xl">
                  {formatNumber(Number(value))}
                </p>
                {(typeof change === "number" || change === null) && (
                  <p className="mt-1 text-[11px]">
                    <Change value={change as number | null} />
                    {change !== null && (
                      <span className="ml-1 text-fg-3">
                        {t("к прошлому периоду")}
                      </span>
                    )}
                  </p>
                )}
              </div>
            ))}
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-fg-3">{t("Артист периода")}</p>
            <p className="mt-1 truncate text-base font-medium">
              {topArtist?.name ?? t("Нет данных")}
            </p>
            {topArtist && (
              <p className="font-mono text-xs text-fg-2">
                {t("{n} прослушиваний", { n: topArtist.plays })}
              </p>
            )}
          </div>
          {preferences.show_new_artists && (
            <div>
              <p className="text-xs text-fg-3">{t("Новые артисты")}</p>
              <p className="mt-1 font-mono text-2xl">{stats.new_artists}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-fg-3">{t("Самый активный день")}</p>
            <p className="mt-1 text-base font-medium">
              {stats.peak_day
                ? prettyDate(stats.peak_day.date)
                : t("Нет данных")}
            </p>
            {stats.peak_day && (
              <p className="font-mono text-xs text-fg-2">
                {t("{n} прослушиваний", { n: stats.peak_day.scrobbles })}
              </p>
            )}
          </div>
        </div>
      </section>

      {sharing && (
        <Dialog
          label={t("Карточка итогов")}
          onClose={() => setSharing(false)}
          className="overflow-y-auto py-8"
        >
          <div className="my-auto flex flex-col items-center gap-4">
            <RecapCard stats={stats} preferences={preferences} />
            <p className="text-center text-xs text-fg-3">
              {t("Сделайте скриншот и поделитесь итогами")}
            </p>
            <button
              type="button"
              onClick={() => setSharing(false)}
              className={`${btn.secondary} ${btn.md}`}
            >
              {t("Закрыть")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
