"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Disc3 } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { EmptyState, Loading, PageHeader } from "@/components/ui";
import { coverAt } from "@/app/lib/coverSize";

interface ArtistTrack {
  id: number;
  title: string;
  album?: string | null;
  cover_url?: string | null;
  plays: number;
}
interface ArtistData {
  name: string;
  cover_url?: string | null;
  tracks_count: number;
  public_plays: number;
  tracks: ArtistTrack[];
}

/** Client-side params of non-ASCII names arrive percent-encoded
 * ("%D0%94…"); encoding them again made every Cyrillic artist "not found". */
function routeName(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // a literal "%" in an already decoded name
  }
}

export default function ArtistPage({
  params,
}: Readonly<{ params: Promise<{ name: string }> }>) {
  const name = routeName(use(params).name);
  const [data, setData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_URL}/api/music/artist/${encodeURIComponent(name)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [name]);
  if (loading) return <Loading label="Загружаем артиста…" />;
  if (!data)
    return (
      <main className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-8 lg:py-10">
        <EmptyState title="Артист не найден">
          В каталоге VEIN пока нет такого артиста.
        </EmptyState>
      </main>
    );
  return (
    <main className="mx-auto flex w-full max-w-[920px] flex-col gap-7 px-4 py-8 sm:px-8 lg:py-10">
      <div className="flex items-center gap-5">
        {data.cover_url ? (
          <img
            src={coverAt(data.cover_url, 96)}
            alt=""
            className="h-24 w-24 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-xl bg-surface-2">
            <Disc3 className="h-9 w-9 text-fg-3" />
          </span>
        )}
        <PageHeader
          title={data.name}
          subtitle={`${data.tracks_count} треков · ${data.public_plays} публичных прослушиваний`}
        />
      </div>
      <ol className="overflow-hidden rounded-xl border border-line bg-surface">
        {data.tracks.map((track, index) => (
          <li
            key={track.id}
            className="border-b border-line-soft last:border-0"
          >
            <Link
              href={`/track/${track.id}`}
              className="grid grid-cols-[28px_44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-surface-2"
            >
              <span className="font-mono text-xs text-fg-3">{index + 1}</span>
              {track.cover_url ? (
                <img
                  src={coverAt(track.cover_url, 44)}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 rounded object-cover"
                />
              ) : (
                <span className="h-11 w-11 rounded bg-surface-2" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="block truncate text-xs text-fg-3">
                  {track.album || "Без альбома"}
                </span>
              </span>
              <span className="font-mono text-xs text-fg-3">{track.plays}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
