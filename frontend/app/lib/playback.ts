const PLAYBACK_WINDOW_MS = 45_000;

export function playbackTimestamp(value: string): number {
  return Date.parse(
    value.replace(" ", "T") +
      (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? "" : "Z"),
  );
}

export function freshPlayback(updatedAt: string, now: number): boolean {
  const timestamp = playbackTimestamp(updatedAt);
  return Number.isFinite(timestamp) && now - timestamp < PLAYBACK_WINDOW_MS;
}

/** Estimate display time only, bounded by heartbeat freshness and duration.
 * `positionSec`: the player's own position at `updatedAt` (Plat Music), so
 * the timer matches the player after seeks, restores and pauses. */
export function listeningElapsed(
  listenedSec: number,
  playing: boolean,
  updatedAt: string,
  duration: number,
  now: number,
  positionSec?: number | null,
): number {
  const timestamp = playbackTimestamp(updatedAt);
  const age = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
  if (positionSec != null) {
    const advance = playing ? Math.min(age, PLAYBACK_WINDOW_MS) / 1000 : 0;
    const shown = Math.floor(Math.max(0, positionSec + advance));
    return duration > 0 ? Math.min(duration, shown) : shown;
  }
  const extra = playing
    ? Math.floor(Math.min(age, PLAYBACK_WINDOW_MS) / 1000)
    : 0;
  return Math.min(duration || 180, Math.max(0, listenedSec + extra));
}
