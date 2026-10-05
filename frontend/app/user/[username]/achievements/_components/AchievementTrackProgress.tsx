"use client";

import { useId, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Music2,
} from "lucide-react";
import { API_URL } from "@/app/lib/api";

interface ProgressTrack {
  id: string | null;
  title: string;
  artist: string;
  url: string | null;
  listened: boolean;
  achievement_artist?: string;
}

interface ArtistProgressGroup {
  name: string;
  url: string | null;
  available: boolean;
  tracks: ProgressTrack[];
  listened_count: number;
  remaining_count: number;
  total_count: number;
}

interface TrackProgressResponse {
  available: boolean;
  tracks: ProgressTrack[];
  listened_count: number;
  remaining_count: number;
  total_count: number;
  artists?: ArtistProgressGroup[];
}

interface Props {
  username: string;
  achievementId: number;
  remaining: number;
  kind: "album" | "artist";
}

function uniqueTrackPhrase(value: number): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod10 === 1 && mod100 !== 11) return `${value} уникальный трек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} уникальных трека`;
  }
  return `${value} уникальных треков`;
}

function TrackLink({ track }: Readonly<{ track: ProgressTrack }>) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{track.title}</span>
      {(track.achievement_artist || track.artist) && (
        <span className="hidden max-w-[42%] truncate text-fg-3 sm:block">
          {track.achievement_artist || track.artist}
        </span>
      )}
      {track.url && (
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
    </>
  );

  return track.url ? (
    <a
      href={track.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 flex-1 items-center gap-2 hover:text-fg"
    >
      {content}
    </a>
  ) : (
    <span className="flex min-w-0 flex-1 items-center gap-2">{content}</span>
  );
}

export function AchievementTrackProgress({
  username,
  achievementId,
  remaining,
  kind,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrackProgressResponse | null>(null);
  const [error, setError] = useState(false);
  const panelId = useId();

  const load = async () => {
    if (data || loading) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `${API_URL}/api/achievements/${kind}-progress/${encodeURIComponent(username)}/${achievementId}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Track progress request failed");
      setData(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const missing = data?.tracks.filter((track) => !track.listened) ?? [];
  const listened = data?.tracks.filter((track) => track.listened) ?? [];

  return (
    <div className="mt-1 border-t border-line-soft pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left text-[12px] text-fg-2 transition-colors hover:text-fg"
      >
        <span className="inline-flex items-center gap-1.5">
          <Music2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {kind === "artist" ? "Незасчитанные треки" : "Какие треки остались"}
          <span className="font-mono text-fg-3">
            · {data?.remaining_count ?? remaining}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={panelId} className="mt-2 flex flex-col gap-2">
          {loading && (
            <span className="flex items-center gap-2 py-2 text-xs text-fg-3">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Получаем трек-лист…
            </span>
          )}
          {error && (
            <div className="flex items-center justify-between gap-3 py-1 text-xs text-fg-3">
              <span>Не удалось загрузить треки.</span>
              <button
                type="button"
                onClick={() => void load()}
                className="text-accent hover:underline"
              >
                Повторить
              </button>
            </div>
          )}
          {data && !data.available && (
            <p className="py-1 text-xs leading-relaxed text-fg-3">
              Музыкальный сервис пока не отдал трек-лист. Общий прогресс
              продолжает считаться.
            </p>
          )}
          {data?.available && (
            <>
              {kind === "artist" && data.artists && data.artists.length > 1 && (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {data.artists.map((artist) => (
                    <li
                      key={artist.name}
                      className="rounded-md border border-line-soft bg-surface/50 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        {artist.url ? (
                          <a
                            href={artist.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-fg-2 hover:text-fg hover:underline"
                          >
                            {artist.name}
                          </a>
                        ) : (
                          <span className="truncate text-fg-2">
                            {artist.name}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-fg-3">
                          {artist.listened_count} / {artist.total_count}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.min(
                              (artist.listened_count /
                                Math.max(artist.total_count, 1)) *
                                100,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">
                <span>
                  {kind === "artist"
                    ? "Ещё не засчитаны"
                    : "Осталось послушать"}
                </span>
                <span>
                  {kind === "artist" ? missing.length : data.remaining_count}
                </span>
              </div>
              {kind === "artist" && (
                <p className="text-[11px] text-fg-3">
                  Для достижения нужно ещё{" "}
                  {uniqueTrackPhrase(data.remaining_count)}.
                </p>
              )}
              {missing.length === 0 ? (
                <p className="text-xs text-accent">Все треки прослушаны.</p>
              ) : (
                <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-line-soft bg-surface/50">
                  {missing.map((track, index) => (
                    <li
                      key={track.id ?? `${track.title}-${index}`}
                      className="flex items-center gap-2 border-b border-line-soft px-2.5 py-2 text-xs text-fg-2 last:border-b-0"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full border border-fg-3" />
                      <TrackLink track={track} />
                    </li>
                  ))}
                </ul>
              )}

              {listened.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none text-[11px] text-fg-3 hover:text-fg-2">
                    Уже засчитано: {listened.length}
                  </summary>
                  <ul className="mt-1 flex max-h-32 flex-col overflow-y-auto">
                    {listened.map((track, index) => (
                      <li
                        key={track.id ?? `${track.title}-${index}`}
                        className="flex items-center gap-2 py-1 text-[11px] text-fg-3"
                      >
                        <Check
                          className="h-3 w-3 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <TrackLink track={track} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-[10px] leading-relaxed text-fg-3">
                {kind === "artist" &&
                  "Каждая композиция считается только один раз. "}
                Трек засчитывается после прослушивания не менее 85%.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
