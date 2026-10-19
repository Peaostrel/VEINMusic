/**
 * schema.org data (JSON-LD) for search engines: the site itself, public
 * profiles, artists and tracks. Built from the same previews as the metadata,
 * and only for pages that are offered to search engines.
 */
import {
  SITE_URL,
  type ArtistPreview,
  type TrackPreview,
  type UserPreview,
} from "./preview";

type Thing = Record<string, unknown>;

const listens = (count: number): Thing => ({
  "@type": "InteractionCounter",
  interactionType: "https://schema.org/ListenAction",
  userInteractionCount: count,
});

export function websiteData(description: string): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "VEINMusic",
    url: SITE_URL,
    description,
    inLanguage: "ru",
  };
}

export function profileData(p: UserPreview, description: string): Thing | null {
  if (!p.indexable || p.is_private) return null;
  const url = `${SITE_URL}/user/${encodeURIComponent(p.username)}`;
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    description,
    mainEntity: {
      "@type": "Person",
      name: p.display_name || p.username,
      alternateName: `@${p.username}`,
      identifier: p.username,
      url,
      ...(p.bio ? { description: p.bio } : {}),
    },
  };
}

export function artistData(
  a: ArtistPreview,
  description: string,
): Thing | null {
  if (a.indexable === false) return null;
  return {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: a.name,
    url: `${SITE_URL}/artist/${encodeURIComponent(a.name)}`,
    description,
    interactionStatistic: listens(a.plays),
  };
}

export function trackData(t: TrackPreview, description: string): Thing | null {
  if (t.indexable === false) return null;
  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: t.title,
    url: `${SITE_URL}/track/${t.id}`,
    description,
    byArtist: {
      "@type": "MusicGroup",
      name: t.artist,
      url: `${SITE_URL}/artist/${encodeURIComponent(t.artist)}`,
    },
    ...(t.album ? { inAlbum: { "@type": "MusicAlbum", name: t.album } } : {}),
    interactionStatistic: listens(t.plays),
  };
}
