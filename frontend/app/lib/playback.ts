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

/** Estimate display time only, bounded by heartbeat freshness and duration. */
export function listeningElapsed(
  listenedSec: number,
  playing: boolean,
  updatedAt: string,
  duration: number,
  now: number,
): number {
  const timestamp = playbackTimestamp(updatedAt);
  const age = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
  const extra = playing
    ? Math.floor(Math.min(age, PLAYBACK_WINDOW_MS) / 1000)
    : 0;
  return Math.min(duration || 180, Math.max(0, listenedSec + extra));
}
