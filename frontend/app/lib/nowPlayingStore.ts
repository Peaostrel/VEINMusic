import { API_URL } from "./api";

export interface CurrentTrack {
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

interface Entry {
  track: CurrentTrack | null;
  revision: number;
  eventKey: string;
  inFlight: Promise<void> | null;
  listeners: Set<(track: CurrentTrack | null) => void>;
}

const entries = new Map<string, Entry>();

function entryFor(username: string) {
  let entry = entries.get(username);
  if (!entry) {
    entry = {
      track: null,
      revision: 0,
      eventKey: "",
      inFlight: null,
      listeners: new Set(),
    };
    entries.set(username, entry);
  }
  return entry;
}

export function getCurrentTrack(username: string) {
  return entryFor(username).track;
}

export function subscribeCurrentTrack(
  username: string,
  listener: (track: CurrentTrack | null) => void,
) {
  const entry = entryFor(username);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function publishCurrentTrack(
  username: string,
  track: CurrentTrack,
  eventKey = "",
) {
  const entry = entryFor(username);
  if (eventKey && entry.eventKey === eventKey) return;
  entry.track = { ...track, receivedAt: performance.now() };
  entry.revision++;
  entry.eventKey = eventKey;
  for (const listener of entry.listeners) listener(entry.track);
}

export function loadCurrentTrack(username: string): Promise<void> {
  const entry = entryFor(username);
  if (entry.inFlight) return entry.inFlight;
  const revision = entry.revision;
  entry.inFlight = (async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/current-track/${encodeURIComponent(username)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok || entry.revision !== revision) return;
      const track: CurrentTrack = await response.json();
      if (entry.revision === revision) publishCurrentTrack(username, track);
    } catch {
      // Keep the latest shared snapshot while the API is unavailable.
    } finally {
      entry.inFlight = null;
    }
  })();
  return entry.inFlight;
}
