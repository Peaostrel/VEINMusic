"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, openSocket } from "@/app/lib/api";
import { useVisiblePolling } from "@/app/lib/usePolling";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { Music2 } from "lucide-react";
import { sourceLabel } from "@/utils/formatters";
import { PlayingBars } from "@/components/ui";

interface CurrentTrack {
  playing: boolean;
  title?: string;
  artist?: string;
  cover_url?: string | null;
  source?: string;
  duration?: number | null;
  listened_sec?: number | null;
  excluded?: boolean | null;
}

// Track switches arrive over the WebSocket; polling only catches up if the
// socket is down
const POLL_MS = 60_000;

/** "Now playing" card for the sidebar; quiet line when nothing plays. */
export default function NowPlaying({
  username,
  variant = "sidebar",
}: Readonly<{ username: string; variant?: "sidebar" | "mobile" | "profile" }>) {
  const mobileRef = useRef<HTMLDetailsElement>(null);
  const [track, setTrack] = useState<CurrentTrack | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/current-track/${encodeURIComponent(username)}`,
        { credentials: "include" },
      );
      if (res.ok) setTrack(await res.json());
    } catch {
      // keep the last state
    }
  }, [username]);

  useVisiblePolling(load, track?.playing ? 10_000 : POLL_MS);
  useEffect(() => {
    if (variant !== "mobile") return;
    const element = mobileRef.current;
    const update = () =>
      document.documentElement.style.setProperty(
        "--playing-offset",
        `${element?.getBoundingClientRect().height ?? 0}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--playing-offset");
    };
  }, [variant, track?.playing]);

  useEffect(
    () =>
      openSocket(
        `/ws/${encodeURIComponent(username)}`,
        (ws) => {
          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "NEW_SCROBBLE" || msg.type === "PLAYBACK_STATE")
                void load();
            } catch {
              // not JSON
            }
          };
        },
        { authed: true },
      ),
    [username, load],
  );

  if (!track?.playing) {
    if (variant !== "sidebar") return null;
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-fg-3">
        Сейчас ничего не играет
      </p>
    );
  }
  const cover = sanitizeImageUrl(track.cover_url);
  const progress =
    track.duration && track.listened_sec != null
      ? Math.min(100, Math.round((track.listened_sec / track.duration) * 100))
      : null;
  const credited = progress !== null && progress >= 85;
  let creditLabel = `${progress}% · зачёт от 85%`;
  if (credited) creditLabel = "Прослушивание засчитано";
  if (track.excluded) creditLabel = "Исключено из статистики";
  const details = (
    <div className="space-y-2">
      {track.source && (
        <p className="text-xs text-fg-2">{sourceLabel(track.source)}</p>
      )}
      {progress !== null && (
        <>
          <progress
            aria-label="Прогресс прослушивания"
            value={progress}
            max={100}
            className="music-progress block h-1.5 w-full"
          />
          <p className="text-xs text-fg-2">{creditLabel}</p>
        </>
      )}
    </div>
  );
  const identity = (
    <span className="flex min-w-0 items-center gap-3">
      {cover ? (
        <img
          src={cover}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Music2 className="h-5 w-5 text-fg-3" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {track.title}
        </span>
        <span className="block truncate text-xs text-fg-2">{track.artist}</span>
      </span>
      <PlayingBars />
    </span>
  );
  if (variant === "mobile")
    return (
      <details
        ref={mobileRef}
        className="mobile-playing border-t border-line bg-surface px-4 py-3 shadow-lg"
      >
        <summary
          aria-label="Сейчас играет — подробности"
          className="cursor-pointer list-none"
        >
          {identity}
        </summary>
        <section className="mt-3" aria-label="Подробности прослушивания">
          {details}
        </section>
      </details>
    );
  return (
    <section
      aria-label="Сейчас играет"
      className="flex flex-col gap-3 rounded-xl border border-accent/20 bg-accent-soft p-4"
    >
      <p className="text-xs font-medium text-accent">Сейчас играет</p>
      {identity}
      {details}
    </section>
  );
}
