"use client";

import { Fragment, useEffect, useState } from "react";
import { sourceLabel } from "@/utils/formatters";
import { PlayingBars } from "@/components/ui";
import { getSafeUrl, getArtistUrl, getTrackUrl } from "./profileUtils";
import type { HistoryEntry } from "@/app/lib/types";

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)
    .toString()
    .padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;

/** Comma-separated artists, each linking to its search page. */
export function ArtistLinks({
  artist,
  source,
  className = "",
}: Readonly<{ artist: string; source: string; className?: string }>) {
  const names = artist
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  return (
    <span className={`truncate ${className}`}>
      {names.map((a, i) => (
        <Fragment key={a}>
          {i > 0 && ", "}
          <a
            href={getArtistUrl(a, source)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg hover:underline"
          >
            {a}
          </a>
        </Fragment>
      ))}
    </span>
  );
}

export const LiveTimer = ({
  listenedSec,
  isPlaying,
  updatedAt,
}: Readonly<{
  listenedSec: number;
  isPlaying: boolean;
  updatedAt: string;
}>) => {
  const [elapsed, setElapsed] = useState(listenedSec);

  useEffect(() => {
    setElapsed(listenedSec);
    if (!isPlaying) return;

    const updateTime = new Date(updatedAt + "Z").getTime();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - updateTime) / 1000);
      setElapsed(listenedSec + Math.max(0, diff));
    }, 1000);

    return () => clearInterval(interval);
  }, [listenedSec, isPlaying, updatedAt]);

  return <span className="font-mono">{mmss(elapsed)}</span>;
};

function PlayState({
  item,
  isNowPlaying,
}: Readonly<{ item: HistoryEntry; isNowPlaying: boolean }>) {
  if (isNowPlaying) {
    return (
      <span
        className={`flex items-center gap-2 font-mono text-[11px] ${item.is_playing ? "text-accent" : "text-fg-3"}`}
      >
        {item.is_playing && <PlayingBars />}
        {item.is_playing ? "сейчас" : "пауза"}
        <LiveTimer
          listenedSec={item.listened_sec}
          isPlaying={item.is_playing}
          updatedAt={item.updated_at}
        />
      </span>
    );
  }
  const timeStr = new Date(item.time + "Z").toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  let note: string | null = null;
  if (item.is_imported) note = "импорт";
  else if (item.listened_sec > 0) note = mmss(item.listened_sec);
  return (
    <span className="flex flex-col items-end gap-0.5 font-mono text-[11px] text-fg-3">
      <span>{timeStr}</span>
      {note && <span>{note}</span>}
    </span>
  );
}

export function HistoryItem({
  item,
  isNowPlaying,
}: Readonly<{
  item: HistoryEntry;
  isLatest?: boolean;
  isNowPlaying: boolean;
}>) {
  const cover = item.cover_url ? getSafeUrl(item.cover_url) : null;
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-line-soft py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_90px_auto]">
      {cover ? (
        <img src={cover} alt="" className="h-10 w-10 rounded object-cover" />
      ) : (
        <span className="h-10 w-10 rounded bg-surface-2" />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
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
      <span className="hidden font-mono text-xs text-fg-3 sm:block">
        {sourceLabel(item.source)}
      </span>
      <PlayState item={item} isNowPlaying={isNowPlaying} />
    </li>
  );
}
