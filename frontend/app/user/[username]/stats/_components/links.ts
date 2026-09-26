import { API_URL } from "@/app/lib/api";
import type { TrackLinkSource } from "@/app/lib/types";
import { sanitizeUrl } from "@/app/utils/sanitizeUrl";

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
    case "yandex":
      return `${API_URL}/api/redirect?source=yandex&type=album&q=${q}`;
    default:
      return "#";
  }
};

export const getTrackUrl = (t: TrackLinkSource) => {
  if (t.source === "yandex" && !t.track_url?.includes("/track/")) {
    return `${API_URL}/api/redirect?source=yandex&type=track&q=${encodeURIComponent(`${t.artist ?? ""} ${t.title ?? ""}`)}`;
  }
  return (t.track_url && sanitizeUrl(t.track_url)) || "#";
};

export const SOURCE_NAMES: Record<string, string> = {
  spotify: "Spotify",
  yandex: "Яндекс Музыка",
  vk: "ВКонтакте",
  youtube_music: "YouTube Music",
  soundcloud: "SoundCloud",
  apple_music: "Apple Music",
  lastfm: "Last.fm",
};
