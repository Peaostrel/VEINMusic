"use client";

import { Meter } from "@/components/ui";
import { getSafeUrl, getTrackUrl } from "./profileUtils";
import { ArtistLinks, HistoryItem } from "./HistoryItem";
import type { ProfileViewProps } from "./useProfilePage";
import { useNow } from "./hooks";

function Cover({
  src,
  round = false,
  size = 40,
}: Readonly<{ src?: string | null; round?: boolean; size?: number }>) {
  const style = { width: size, height: size };
  const shape = round ? "rounded-full" : "rounded";
  return src ? (
    <img
      src={getSafeUrl(src)}
      alt=""
      className={`shrink-0 object-cover ${shape}`}
      style={style}
    />
  ) : (
    <span className={`shrink-0 bg-surface-2 ${shape}`} style={style} />
  );
}

export function ProfileMainGrid({ data, recs, wrapped }: ProfileViewProps) {
  const now = useNow();
  const topArtists = data.stats.top_artists ?? [];
  const topTracks = data.stats.top_tracks ?? [];
  const maxArtist = topArtists[0]?.plays || 1;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-10">
        {recs.length > 0 && (
          <section aria-labelledby="recs-title" className="flex flex-col gap-4">
            <h2 id="recs-title" className="text-base font-semibold">
              Может понравиться
            </h2>
            <ul className="hide-scrollbar flex gap-3 overflow-x-auto pb-1">
              {recs.map((r) => (
                <li
                  key={r.artist}
                  className="flex w-[150px] shrink-0 flex-col gap-2 rounded-xl border border-line bg-surface p-3"
                >
                  {r.cover_url ? (
                    <img
                      src={getSafeUrl(r.cover_url)}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ) : (
                    <span className="aspect-square w-full rounded-lg bg-surface-2" />
                  )}
                  <span className="truncate text-sm font-medium">
                    {r.artist}
                  </span>
                  <span className="line-clamp-2 text-xs text-fg-3">
                    {r.reason}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="history-title"
          className="flex flex-col gap-3"
        >
          <h2 id="history-title" className="text-base font-semibold">
            История
          </h2>
          {data.history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-fg-2">
              Тут пока пусто.
            </p>
          ) : (
            <ol className="border-t border-line-soft">
              {data.history.map((item, idx: number) => {
                const isNowPlaying =
                  idx === 0 &&
                  (item.is_playing ||
                    (now !== null &&
                      now - Date.parse(item.updated_at + "Z") <
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
      </div>

      <aside className="flex flex-col gap-8">
        {wrapped && wrapped.top_artist !== "Нет данных" && (
          <section
            aria-labelledby="month-title"
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <h2 id="month-title" className="text-sm font-semibold">
              Итоги месяца
            </h2>
            <dl className="grid grid-cols-2 gap-4">
              <div className="flex min-w-0 flex-col-reverse gap-0.5">
                <dt className="text-xs text-fg-2">артист месяца</dt>
                <dd className="truncate text-base font-medium">
                  {wrapped.top_artist}
                </dd>
              </div>
              <div className="flex flex-col-reverse gap-0.5">
                <dt className="text-xs text-fg-2">минут музыки</dt>
                <dd className="font-mono text-xl">{wrapped.total_minutes}</dd>
              </div>
            </dl>
            <span className="self-start rounded border border-line px-2 py-0.5 font-mono text-[11px] text-fg-2">
              {wrapped.status}
            </span>
          </section>
        )}

        <section
          aria-labelledby="top-tracks-title"
          className="flex flex-col gap-3"
        >
          <h2 id="top-tracks-title" className="text-sm font-semibold">
            Топ треков
          </h2>
          {topTracks.length === 0 ? (
            <p className="text-sm text-fg-3">Пока нет данных.</p>
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

        <section
          aria-labelledby="top-artists-title"
          className="flex flex-col gap-3"
        >
          <h2 id="top-artists-title" className="text-sm font-semibold">
            Топ артистов
          </h2>
          {topArtists.length === 0 ? (
            <p className="text-sm text-fg-3">Пока нет данных.</p>
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
      </aside>
    </div>
  );
}
