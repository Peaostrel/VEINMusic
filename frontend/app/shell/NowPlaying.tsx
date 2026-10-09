"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, openSocket } from "@/app/lib/api";
import { useVisiblePolling } from "@/app/lib/usePolling";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { PlayingBars } from "@/components/ui";

interface CurrentTrack {
  playing: boolean;
  title?: string;
  artist?: string;
  cover_url?: string | null;
}

// Track switches arrive over the WebSocket; polling only catches up if the
// socket is down
const POLL_MS = 60_000;

/** "Now playing" card for the sidebar; quiet line when nothing plays. */
export default function NowPlaying({
  username,
}: Readonly<{ username: string }>) {
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

  useVisiblePolling(load, POLL_MS);

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
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-fg-3">
        Сейчас ничего не играет
      </p>
    );
  }
  const cover = sanitizeImageUrl(track.cover_url);
  return (
    <section
      aria-label="Сейчас играет"
      className="flex flex-col gap-2.5 rounded-xl border border-line p-3"
    >
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
        <span>Сейчас играет</span>
        <PlayingBars />
      </div>
      <div className="flex items-center gap-2.5">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-10 w-10 shrink-0 rounded object-cover"
          />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded bg-surface-2" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-fg">
            {track.title}
          </span>
          <span className="block truncate text-xs text-fg-2">
            {track.artist}
          </span>
        </span>
      </div>
    </section>
  );
}
