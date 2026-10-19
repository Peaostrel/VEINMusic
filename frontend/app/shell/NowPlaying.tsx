"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, subscribeSocket } from "@/app/lib/api";
import { useVisiblePolling } from "@/app/lib/usePolling";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { Music2, Pause } from "lucide-react";
import {
  playbackProgress,
  playbackTime,
  playbackTimestamp,
} from "@/app/lib/playback";
import { sourceLabel } from "@/utils/formatters";
import { PlayingBars } from "@/components/ui";
import { coverAt } from "@/app/lib/coverSize";

interface CurrentTrack {
  playing: boolean;
  paused?: boolean;
  title?: string;
  artist?: string;
  cover_url?: string | null;
  source?: string;
  duration?: number | null;
  listened_sec?: number | null;
  excluded?: boolean | null;
  display_listened_sec?: number | null;
  display_position_sec?: number | null;
  playback_remaining_sec?: number | null;
  receivedAt?: number;
}

interface LiveMessageHandlers {
  reload: () => Promise<void>;
  invalidateRequest: () => void;
  setTrack: (track: CurrentTrack) => void;
}

function handleLiveMessage(event: MessageEvent, handlers: LiveMessageHandlers) {
  try {
    const message = JSON.parse(event.data);
    if (message.type !== "NEW_SCROBBLE" && message.type !== "PLAYBACK_STATE") {
      return;
    }
    globalThis.dispatchEvent(new Event("account_data_update"));
    if (!message.track) {
      void handlers.reload();
      return;
    }
    // A late HTTP response must not undo a pause or skip.
    handlers.invalidateRequest();
    const item = message.track;
    const age = Math.max(
      0,
      (Date.now() - playbackTimestamp(item.updated_at)) / 1000,
    );
    const advance = item.is_playing ? Math.min(age, 45) : 0;
    handlers.setTrack({
      ...item,
      playing: item.is_playing && age < 45,
      paused: !item.is_playing,
      display_listened_sec: item.listened_sec + advance,
      display_position_sec:
        item.position_sec == null ? null : item.position_sec + advance,
      playback_remaining_sec: Math.max(0, 45 - age),
      receivedAt: performance.now(),
    });
  } catch {
    // Ignore malformed messages; polling still reconciles state.
  }
}

function listeningCreditLabel(track: CurrentTrack, progress: number | null) {
  if (track.excluded) return "Исключено из статистики";
  const credited =
    !!track.duration &&
    track.listened_sec != null &&
    track.listened_sec * 100 >= track.duration * 85;
  if (credited) return "Прослушивание засчитано";
  return `${progress}% · зачёт от 85%`;
}

// WebSocket events refresh immediately; polling also reconciles heartbeat data.
const POLL_MS = 10_000;

/** "Now playing" card for the sidebar; quiet line when nothing plays. */
export default function NowPlaying({
  username,
  variant = "sidebar",
  live = true,
}: Readonly<{
  username: string;
  variant?: "sidebar" | "mobile" | "profile";
  /** Live updates: the server opens only the viewer's own channel, so on
   * someone else's profile a socket is rejected and retried forever. */
  live?: boolean;
}>) {
  const mobileRef = useRef<HTMLDetailsElement>(null);
  const [track, setTrack] = useState<CurrentTrack | null>(null);
  const [clock, setClock] = useState(0);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "live" | "retrying"
  >("connecting");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const res = await fetch(
        `${API_URL}/api/current-track/${encodeURIComponent(username)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (res.ok) {
        const data: CurrentTrack = await res.json();
        if (sequence === requestSequence.current)
          setTrack({ ...data, receivedAt: performance.now() });
      }
    } catch {
      // keep the last state
    }
  }, [username]);

  useVisiblePolling(load, POLL_MS);
  const tick = useCallback(() => setClock(performance.now()), []);
  useVisiblePolling(tick, 1_000, !!track?.playing);
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

  useEffect(() => {
    if (!live) return;
    const subscription = subscribeSocket(
      `/ws/${encodeURIComponent(username)}`,
      {
        onOpen: () => {
          setConnectionState("live");
          void load();
        },
        onClose: () => setConnectionState("retrying"),
        onMessage: (event) =>
          handleLiveMessage(event, {
            reload: load,
            invalidateRequest: () => requestSequence.current++,
            setTrack,
          }),
      },
      { authed: true },
    );
    return () => subscription.close();
  }, [username, load, live]);

  const elapsed = track?.playing
    ? Math.max(0, (clock - (track.receivedAt ?? clock)) / 1_000)
    : 0;
  const remaining = track?.playback_remaining_sec ?? 45;
  if (
    (!track?.playing && !track?.paused) ||
    (track?.playing && elapsed >= remaining)
  ) {
    if (variant !== "sidebar") return null;
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-fg-3">
        Сейчас ничего не играет
      </p>
    );
  }
  const cover = sanitizeImageUrl(track.cover_url);
  const progress = playbackProgress(
    track.duration,
    track.display_listened_sec ?? track.listened_sec,
    elapsed,
    track.display_position_sec,
  );
  const creditLabel = listeningCreditLabel(track, progress);
  const details = (
    <div className="space-y-2">
      {live && (
        <p className="flex items-center gap-1.5 text-xs text-fg-3">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connectionState === "live" ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {connectionState === "live"
            ? "Обновляется мгновенно"
            : "Переподключение…"}
        </p>
      )}
      {track.source && (
        <p className="text-xs text-fg-2">{sourceLabel(track.source)}</p>
      )}
      {track.display_position_sec != null && (
        <p className="font-mono text-xs text-fg-2">
          {playbackTime(
            Math.min(
              track.duration ?? Infinity,
              track.display_position_sec + elapsed,
            ),
          )}
          {track.duration ? ` / ${playbackTime(track.duration)}` : ""}
        </p>
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
          src={coverAt(cover, 48)}
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
      {track.paused ? (
        <Pause className="h-4 w-4 text-fg-3" aria-label="Пауза" />
      ) : (
        <PlayingBars />
      )}
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
      <p className="text-xs font-medium text-accent">
        {track.paused ? "На паузе" : "Сейчас играет"}
      </p>
      {identity}
      {details}
    </section>
  );
}
