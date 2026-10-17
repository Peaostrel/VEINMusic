const PLAYBACK_WINDOW_MS = 45_000;

export function playbackTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

/** Percentage shown by the player card. A player-reported position must win
 * over credited listening time so a late first report does not start at 0%. */
export function playbackProgress(
  duration: number | null | undefined,
  listenedSec: number | null | undefined,
  elapsed: number,
  positionSec?: number | null,
): number | null {
  if (!duration || listenedSec == null) return null;
  const base = positionSec ?? listenedSec;
  return Math.min(
    100,
    Math.floor((Math.max(0, base + Math.max(0, elapsed)) / duration) * 100),
  );
}

/** Apply one complete player snapshot; older deliveries cannot revive a
 * previous track or roll the same track back to an earlier pause/position. */
export function applyPlaybackUpdate<
  T extends { id: number; updated_at: string; is_playing: boolean },
>(history: T[], track: T): T[] {
  if (history[0]?.id > track.id) return history;
  const previous = history.find((item) => item.id === track.id);
  if (
    previous &&
    playbackTimestamp(previous.updated_at) > playbackTimestamp(track.updated_at)
  )
    return history;
  return [
    { ...previous, ...track },
    ...history
      .filter((item) => item.id !== track.id)
      .map((item) => (item.is_playing ? { ...item, is_playing: false } : item)),
  ].slice(0, 50);
}

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
