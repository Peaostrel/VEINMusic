"use client";

import Link from "next/link";
import { Meter, btn } from "@/components/ui";
import { getSafeUrl, getTrackUrl } from "./profileUtils";
import { ArtistLinks, HistoryItem } from "./HistoryItem";
import { playbackTimestamp } from "@/app/lib/playback";
import type { ProfileViewProps } from "./useProfilePage";
import type { ProfileSection } from "@/app/lib/types";
import { useNow } from "./hooks";
import { coverAt } from "@/app/lib/coverSize";
import { useT } from "@/app/lib/i18n/client";

function Cover({
  src,
  round = false,
  size = 40,
}: Readonly<{ src?: string | null; round?: boolean; size?: number }>) {
  const style = { width: size, height: size };
  const shape = round ? "rounded-full" : "rounded";
  return src ? (
    <img
      src={getSafeUrl(coverAt(src, size))}
      alt=""
      loading="lazy"
      className={`shrink-0 object-cover ${shape}`}
      style={style}
    />
  ) : (
    <span className={`shrink-0 bg-surface-2 ${shape}`} style={style} />
  );
}

export function ProfileMainGrid({
  data,
  wrapped,
  u,
  isMyProfile,
}: ProfileViewProps) {
  const t = useT();
  const now = useNow();
  const topArtists = data.stats.top_artists ?? [];
  const topTracks = data.stats.top_tracks ?? [];
  const maxArtist = topArtists[0]?.plays || 1;
  const profileSettings = u.preferences?.profile;
  const hidden = new Set(profileSettings?.hidden_sections ?? []);
  const order = profileSettings?.section_order ?? [
    "showcase",
    "history",
    "wrapped",
    "top_tracks",
    "top_artists",
  ];
  const priority = (section: ProfileSection) => {
    const index = order.indexOf(section);
    return index < 0 ? 99 : index;
  };
  const alternateLayout =
    u.preferences?.experiments.new_profile_layout ?? false;
  const tastePassport = u.preferences?.experiments.taste_passport ?? false;

  return (
    <div
      className={`grid gap-10 ${
        alternateLayout
          ? "lg:grid-cols-[320px_minmax(0,1fr)] lg:[&>aside]:order-first"
          : "lg:grid-cols-[minmax(0,1fr)_320px]"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-10">
        {!hidden.has("history") && (
          <section
            aria-labelledby="history-title"
            className="flex flex-col gap-3"
            style={{ order: priority("history") }}
          >
            <h2 id="history-title" className="text-base font-semibold">
              {t("История")}
            </h2>
            {data.history.length === 0 && isMyProfile ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-5 py-10 text-center">
                <p className="text-sm font-medium">
                  {t("Здесь появится всё, что вы слушаете")}
                </p>
                <p className="max-w-sm text-sm text-fg-2">
                  {t(
                    "Подключите Яндекс Музыку, Spotify или SoundCloud либо поставьте расширение: первый трек появится через пару секунд.",
                  )}
                </p>
                <Link
                  href="/library/connect"
                  className={`${btn.primary} ${btn.sm} mt-1`}
                >
                  {t("Подключить музыку")}
                </Link>
              </div>
            ) : data.history.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-fg-2">
                {t("Тут пока пусто.")}
              </p>
            ) : (
              <ol className="border-t border-line-soft">
                {data.history.map((item, idx: number) => {
                  const isNowPlaying =
                    idx === 0 &&
                    (item.is_playing ||
                      (now !== null &&
                        now - playbackTimestamp(item.updated_at) <
                          15 * 60 * 1000));
                  return (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      isNowPlaying={isNowPlaying}
                    />
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-8">
        {tastePassport && (
          <section className="flex flex-col gap-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                Taste Passport
              </span>
              <h2 className="mt-1 text-sm font-semibold">
                {t("Музыкальный паспорт")}
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <dt className="text-xs text-fg-3">{t("главный артист")}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium">
                  {topArtists[0]?.artist ?? t("Пока не определён")}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-fg-3">{t("любимый жанр")}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium">
                  {u.favorite_genre || t("Не указан")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-3">{t("серия")}</dt>
                <dd className="mt-0.5 font-mono text-lg">
                  {t("{n} дн.", { n: u.streak })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-3">{t("треков в топе")}</dt>
                <dd className="mt-0.5 font-mono text-lg">{topTracks.length}</dd>
              </div>
            </dl>
          </section>
        )}

        {!hidden.has("wrapped") &&
          wrapped &&
          wrapped.top_artist !== "Нет данных" && (
            <section
              aria-labelledby="month-title"
              className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
              style={{ order: priority("wrapped") }}
            >
              <h2 id="month-title" className="text-sm font-semibold">
                {t("Итоги месяца")}
              </h2>
              <dl className="grid grid-cols-2 gap-4">
                <div className="flex min-w-0 flex-col-reverse gap-0.5">
                  <dt className="text-xs text-fg-2">{t("артист месяца")}</dt>
                  <dd className="truncate text-base font-medium">
                    {wrapped.top_artist}
                  </dd>
                </div>
                <div className="flex flex-col-reverse gap-0.5">
                  <dt className="text-xs text-fg-2">{t("минут музыки")}</dt>
                  <dd className="font-mono text-xl">{wrapped.total_minutes}</dd>
                </div>
              </dl>
              <span className="self-start rounded border border-line px-2 py-0.5 font-mono text-[11px] text-fg-2">
                {t(wrapped.status)}
              </span>
            </section>
          )}

        {!hidden.has("top_tracks") && (
          <section
            aria-labelledby="top-tracks-title"
            className="flex flex-col gap-3"
            style={{ order: priority("top_tracks") }}
          >
            <h2 id="top-tracks-title" className="text-sm font-semibold">
              {t("Топ треков")}
            </h2>
            {topTracks.length === 0 ? (
              <p className="text-sm text-fg-3">{t("Пока нет данных.")}</p>
            ) : (
              <ol className="border-t border-line-soft">
                {topTracks.map((item, i) => (
                  <li
                    key={item.title + item.artist}
                    className="grid grid-cols-[20px_40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft py-2.5"
                  >
                    <span className="font-mono text-xs text-fg-3">{i + 1}</span>
                    <Cover src={item.cover_url} />
                    <span className="flex min-w-0 flex-col">
                      <a
                        href={getSafeUrl(getTrackUrl(item))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm hover:underline"
                      >
                        {item.title}
                      </a>
                      <ArtistLinks
                        artist={item.artist}
                        source={item.source}
                        className="text-xs text-fg-2"
                      />
                    </span>
                    <span className="font-mono text-[13px] text-fg-2">
                      {item.plays}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {!hidden.has("top_artists") && (
          <section
            aria-labelledby="top-artists-title"
            className="flex flex-col gap-3"
            style={{ order: priority("top_artists") }}
          >
            <h2 id="top-artists-title" className="text-sm font-semibold">
              {t("Топ артистов")}
            </h2>
            {topArtists.length === 0 ? (
              <p className="text-sm text-fg-3">{t("Пока нет данных.")}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {topArtists.map((item, i) => (
                  <li
                    key={item.artist}
                    className="grid grid-cols-[20px_minmax(0,1fr)_48px] items-center gap-3"
                  >
                    <span className="font-mono text-xs text-fg-3">{i + 1}</span>
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <ArtistLinks
                        artist={item.artist}
                        source={item.source}
                        className="text-sm font-medium"
                      />
                      <Meter
                        value={item.plays}
                        max={maxArtist}
                        accent={i === 0}
                      />
                    </span>
                    <span className="text-right font-mono text-[13px] text-fg-2">
                      {item.plays}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
