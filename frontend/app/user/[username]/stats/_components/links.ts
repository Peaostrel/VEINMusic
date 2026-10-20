import { API_URL } from "@/app/lib/api";
import type { TrackLinkSource } from "@/app/lib/types";
import { sanitizeUrl } from "@/app/utils/sanitizeUrl";
import { msg } from "@/app/lib/i18n/core";
import { currentLocale, tr } from "@/app/lib/i18n/active";

/** Search link for an artist on the service the plays came from. */
export const getArtistUrl = (artist: string, source: string) => {
  if (!artist) return "#";
  const q = encodeURIComponent(artist);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${q}/artists`;
    case "vk":
      return `https://vk.com/audio?q=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "soundcloud":
      return `https://soundcloud.com/search/people?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    case "zvuk":
      return `https://zvuk.com/search?query=${q}`;
    case "yandex":
      return `${API_URL}/api/redirect?source=yandex&type=artist&q=${q}`;
    default:
      return "#";
  }
};

export const getAlbumUrl = (album: string, artist: string, source: string) => {
  if (!album) return "#";
  const q = encodeURIComponent(`${artist} ${album}`);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${q}/albums`;
    case "vk":
      return `https://vk.com/audio?q=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "soundcloud":
      return `https://soundcloud.com/search/albums?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    case "zvuk":
      return `https://zvuk.com/search?query=${q}`;
    case "yandex":
      return `${API_URL}/api/redirect?source=yandex&type=album&q=${q}`;
    default:
      return "#";
  }
};

export const getTrackUrl = (t: TrackLinkSource) => {
  if (t.source === "yandex" && !t.track_url?.includes("/track/")) {
    const query = encodeURIComponent(`${t.artist ?? ""} ${t.title ?? ""}`);
    return `${API_URL}/api/redirect?source=yandex&type=track&q=${query}`;
  }
  return (t.track_url && sanitizeUrl(t.track_url)) || "#";
};

export const SOURCE_NAMES: Record<string, string> = {
  spotify: "Spotify",
  yandex: msg("Яндекс Музыка"),
  vk: msg("ВКонтакте"),
  youtube_music: "YouTube Music",
  soundcloud: "SoundCloud",
  apple_music: "Apple Music",
  zvuk: msg("Звук"),
  lastfm: "Last.fm",
  spotify_import: msg("Spotify (архив)"),
  listenbrainz_import: "ListenBrainz",
};

/**
 * The stats period's label ("За последние 7 дней") in the interface
 * language. The server writes it in Russian; the year and the custom range
 * carry numbers, so those are rebuilt here.
 */
export function periodLabel(period: {
  id: string;
  label: string;
  start: string | null;
}): string {
  if (period.id === "year" && period.start) {
    const year = new Date(period.start).getFullYear();
    if (Number.isFinite(year)) return tr("С начала {year} года", { year });
  }
  if (period.id === "custom") {
    const dates = [...period.label.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
    if (dates.length === 2) {
      const format = (m: RegExpMatchArray) =>
        new Date(
          Number(m[3]),
          Number(m[2]) - 1,
          Number(m[1]),
        ).toLocaleDateString(currentLocale(), {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      return `${format(dates[0])} — ${format(dates[1])}`;
    }
  }
  return tr(period.label);
}
