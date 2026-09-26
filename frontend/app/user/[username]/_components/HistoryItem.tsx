"use client";

import { useState, useEffect } from "react";
import { getPlatformIcon } from "../../../../utils/formatters";
import { getSafeUrl, getArtistUrl, getTrackUrl } from "./profileUtils";
import type { HistoryEntry } from "@/app/lib/types";

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

  const m = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return (
    <span
      className={`font-mono text-[11px] px-1.5 py-0.5 rounded shadow-[0_0_5px_var(--accent-glow)] ${isPlaying ? "bg-[var(--accent)]/20 text-[var(--accent-text)]" : "bg-gray-500/20 text-gray-400"}`}
    >
      {m}:{s}
    </span>
  );
};

export function PastPlayIndicator({ item }: Readonly<{ item: HistoryEntry }>) {
  const timeStr = new Date(item.time + "Z").toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (item.is_imported) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="bg-black/50 text-[10px] px-2 py-1 rounded text-gray-300 border border-white/5 font-mono">
          {timeStr}
        </span>
        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded border border-white/5 shadow-inner">
          Импортировано
        </span>
      </div>
    );
  }

  const listenedSec = item.listened_sec || 0;
  const showListened = listenedSec > 0;
  const m = Math.floor(listenedSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (listenedSec % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="bg-black/50 text-[10px] px-2 py-1 rounded text-gray-300 border border-white/5 font-mono">
        {timeStr}
      </span>
      {showListened && (
        <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider">
          Прослушано: {m}:{s}
        </span>
      )}
    </div>
  );
}

export function NowPlayingIndicator({
  item,
}: Readonly<{ item: HistoryEntry }>) {
  const playStatusText = item.is_playing ? "Сейчас" : "Пауза";
  const accentTextClass = item.is_playing
    ? "text-[var(--accent-text)]"
    : "text-gray-400";
  const animClass = item.is_playing
    ? "animate-[bounce_1s_infinite]"
    : "opacity-40";
  const animClass2 = item.is_playing
    ? "animate-[bounce_1s_infinite_0.2s]"
    : "opacity-40";
  const animClass3 = item.is_playing
    ? "animate-[bounce_1s_infinite_0.4s]"
    : "opacity-40";

  return (
    <div className="flex items-center gap-2 bg-[#121212]/80 px-3 py-1.5 rounded-md border border-white/5 shadow-md">
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[10px] font-black uppercase tracking-widest ${accentTextClass}`}
        >
          {playStatusText}
        </span>
        <LiveTimer
          listenedSec={item.listened_sec}
          isPlaying={item.is_playing}
          updatedAt={item.updated_at}
        />
      </div>
      <div className="flex items-end gap-[2px] h-3 w-3 ml-1">
        <div
          className={`w-[3px] bg-[var(--accent)] h-full rounded-t-sm ${animClass}`}
        ></div>
        <div
          className={`w-[3px] bg-[var(--accent)] h-2/3 rounded-t-sm ${animClass2}`}
        ></div>
        <div
          className={`w-[3px] bg-[var(--accent)] h-4/5 rounded-t-sm ${animClass3}`}
        ></div>
      </div>
    </div>
  );
}

export function PlayStateIndicator({
  item,
  isNowPlaying,
}: Readonly<{ item: HistoryEntry; isNowPlaying: boolean }>) {
  if (isNowPlaying) {
    return <NowPlayingIndicator item={item} />;
  }
  return <PastPlayIndicator item={item} />;
}

export function HistoryItem({
  item,
  isLatest,
  isNowPlaying,
}: Readonly<{
  item: HistoryEntry;
  isLatest: boolean;
  isNowPlaying: boolean;
}>) {
  return (
    <li
      className={`p-3 rounded-xl flex justify-between items-center transition-all duration-300 group relative ${isLatest ? "bg-gradient-to-r from-white/10 to-transparent border-l-4 border-[var(--accent)] shadow-md" : "bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/5"}`}
    >
      <div className="flex items-center gap-4 pr-2 w-full min-w-0">
        <div className="w-12 h-12 rounded bg-black shrink-0 overflow-hidden shadow z-10 pointer-events-auto relative">
          {item.cover_url ? (
            <img
              src={getSafeUrl(item.cover_url)}
              className="w-full h-full object-cover"
              alt={item.title}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-xl text-yellow-500/80 shadow-inner">
              🎵
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center flex-grow min-w-[0] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex items-center gap-1.5 mb-0.5 w-max">
            <div className="shrink-0">{getPlatformIcon(item.source)}</div>
            <a
              href={getSafeUrl(getTrackUrl(item))}
              target="_blank"
              rel="noopener noreferrer"

              className={`font-bold text-lg whitespace-nowrap hover:underline hover:text-[var(--accent-text)] transition-colors pointer-events-auto pr-4 ${isLatest ? "text-[var(--accent-text)]" : "text-white"}`}
            >
              {item.title}
            </a>
          </div>

          <div className="text-gray-300 text-xs whitespace-nowrap pointer-events-auto relative z-10 w-max pr-4">
            {item.artist.split(",").map((a: string) => (
              <span key={a.trim()}>
                <a
                  href={getArtistUrl(a.trim(), item.source)}
                  target="_blank"
                  rel="noopener noreferrer"

                  className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10 font-medium"
                >
                  {a.trim()}
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
        <PlayStateIndicator item={item} isNowPlaying={isNowPlaying} />
      </div>
    </li>
  );
}
