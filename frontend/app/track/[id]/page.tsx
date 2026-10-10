"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import SaveForLater from "@/components/SaveForLater";
import { ExternalLink, Music2 } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { EmptyState, Loading, btn } from "@/components/ui";
import { sourceLabel } from "@/utils/formatters";

interface TrackData {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  cover_url?: string | null;
  track_url?: string | null;
  duration: number;
  plays: number;
  source_counts: Record<string, number>;
}
function duration(seconds: number) {
  return seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "неизвестно";
}

export default function TrackPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_URL}/api/music/track/${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);
  if (loading) return <Loading label="Загружаем трек…" />;
  if (!data)
    return (
      <EmptyState title="Трек не найден">
        Возможно, запись была объединена с другой.
      </EmptyState>
    );
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-7 px-4 py-10 sm:px-8">
      <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:flex-row">
        {data.cover_url ? (
          <img
            src={data.cover_url}
            alt=""
            className="aspect-square w-full rounded-xl object-cover sm:w-56"
          />
        ) : (
          <span className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-2 sm:w-56">
            <Music2 className="h-12 w-12 text-fg-3" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="font-mono text-xs uppercase tracking-wide text-accent">
            Трек
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
            {data.title}
          </h1>
          <Link
            href={`/artist/${encodeURIComponent(data.artist)}`}
            className="mt-2 self-start text-lg text-fg-2 hover:text-accent"
          >
            {data.artist}
          </Link>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-fg-3">Альбом</dt>
              <dd>{data.album || "Не указан"}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-3">Жанр</dt>
              <dd>{data.genre || "Не определён"}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-3">Длительность</dt>
              <dd className="font-mono">{duration(data.duration)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-3">Публичные прослушивания</dt>
              <dd className="font-mono">{data.plays}</dd>
            </div>
          </dl>
          <SaveForLater trackId={data.id} />
          {data.track_url && (
            <a
              href={data.track_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn.secondary} ${btn.md} mt-6 self-start`}
            >
              <ExternalLink className="h-4 w-4" />
              Открыть в сервисе
            </a>
          )}
        </div>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Источники</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(data.source_counts).map(([source, plays]) => (
            <span
              key={source}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-fg-2"
            >
              {sourceLabel(source)} · {plays}
            </span>
          ))}
          {Object.keys(data.source_counts).length === 0 && (
            <span className="text-sm text-fg-3">
              Публичных прослушиваний пока нет.
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
