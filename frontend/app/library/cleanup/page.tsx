"use client";

import { useCallback, useEffect, useState } from "react";
import { Merge, Search, Trash2 } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { EmptyState, Loading, PageHeader, btn, input } from "@/components/ui";
import { sourceLabel } from "@/utils/formatters";

interface Track {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  cover_url?: string | null;
  plays: number;
}
interface ManagedScrobble {
  id: number;
  played_at: string;
  source: string;
  listened_sec: number;
  track: Track;
}

export default function CleanupPage() {
  const [duplicates, setDuplicates] = useState<Track[][]>([]);
  const [history, setHistory] = useState<ManagedScrobble[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const [duplicateRes, historyRes] = await Promise.all([
      fetch(`${API_URL}/api/me/scrobbles/duplicates`, {
        credentials: "include",
      }),
      fetch(
        `${API_URL}/api/me/scrobbles/manage?q=${encodeURIComponent(query)}`,
        { credentials: "include" },
      ),
    ]);
    if (duplicateRes.ok)
      setDuplicates(
        ((await duplicateRes.json()) as { groups?: Track[][] }).groups ?? [],
      );
    if (historyRes.ok) setHistory(await historyRes.json());
    setLoading(false);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const merge = async (source: Track, target: Track) => {
    if (
      !confirm(
        `Объединить «${source.title}» с «${target.title}» в вашей истории?`,
      )
    )
      return;
    const response = await fetch(`${API_URL}/api/me/scrobbles/merge`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_track_id: source.id,
        target_track_id: target.id,
      }),
    });
    setStatus(
      response.ok
        ? "Треки объединены. Будущие прослушивания тоже будут нормализованы."
        : "Не удалось объединить треки.",
    );
    if (response.ok) await load();
  };
  const remove = async (item: ManagedScrobble) => {
    if (
      !confirm(
        `Удалить прослушивание «${item.track.title}»? Вернуть его будет нельзя.`,
      )
    )
      return;
    const response = await fetch(`${API_URL}/api/me/scrobbles/${item.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok)
      setHistory((current) => current.filter((entry) => entry.id !== item.id));
  };
  if (loading) return <Loading label="Ищем дубли…" />;
  return (
    <main className="mx-auto flex w-full max-w-[980px] flex-col gap-9 px-4 py-8 sm:px-8 lg:py-10">
      <PageHeader
        title="Порядок в истории"
        subtitle="Изменения затрагивают только вашу статистику"
      />
      {status && (
        <output
          aria-live="polite"
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg-2"
        >
          {status}
        </output>
      )}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Возможные дубли</h2>
          <p className="mt-1 text-xs text-fg-3">
            VEIN сравнивает написание и версии треков. Канонический вариант
            выбираете вы.
          </p>
        </div>
        {duplicates.length === 0 ? (
          <EmptyState title="Дублей не найдено">
            Ваша библиотека уже выглядит аккуратно.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {duplicates.map((group) => (
              <DuplicateGroup
                key={group.map((track) => track.id).join("-")}
                tracks={group}
                onMerge={merge}
              />
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-base font-semibold">Последние прослушивания</h2>
            <p className="mt-1 text-xs text-fg-3">
              Здесь можно убрать случайно записанный трек.
            </p>
          </div>
          <label className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-fg-3" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Трек или артист"
              className={`${input} h-10 pl-9`}
            />
          </label>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {history.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0"
            >
              {item.track.cover_url ? (
                <img
                  src={item.track.cover_url}
                  alt=""
                  className="h-11 w-11 rounded object-cover"
                />
              ) : (
                <span className="h-11 w-11 rounded bg-surface-2" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {item.track.title}
                </span>
                <span className="block truncate text-xs text-fg-3">
                  {item.track.artist} · {sourceLabel(item.source)} ·{" "}
                  {new Date(item.played_at).toLocaleString("ru-RU")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Удалить ${item.track.title}`}
                className="rounded-lg p-2 text-fg-3 hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {history.length === 0 && (
            <EmptyState title="Ничего не найдено">
              Попробуйте другой запрос.
            </EmptyState>
          )}
        </div>
      </section>
    </main>
  );
}

function DuplicateGroup({
  tracks,
  onMerge,
}: Readonly<{
  tracks: Track[];
  onMerge: (source: Track, target: Track) => void;
}>) {
  const [targetId, setTargetId] = useState(tracks[0].id);
  const target = tracks.find((track) => track.id === targetId) ?? tracks[0];
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-xs text-fg-3">Какой вариант оставить основным?</p>
      <div className="flex flex-col gap-2">
        {tracks.map((track) => (
          <label
            key={track.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${targetId === track.id ? "border-accent bg-accent/5" : "border-line-soft"}`}
          >
            <input
              type="radio"
              name={`target-${tracks[0].id}`}
              checked={targetId === track.id}
              onChange={() => setTargetId(track.id)}
            />
            {track.cover_url ? (
              <img
                src={track.cover_url}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <span className="h-10 w-10 rounded bg-surface-2" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {track.title}
              </span>
              <span className="block truncate text-xs text-fg-3">
                {track.artist} · {track.plays} прослушиваний
              </span>
            </span>
            {targetId !== track.id && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onMerge(track, target);
                }}
                className={`${btn.secondary} ${btn.sm}`}
              >
                <Merge className="h-3.5 w-3.5" />
                Объединить
              </button>
            )}
          </label>
        ))}
      </div>
    </article>
  );
}
