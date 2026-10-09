/**
 * Server-side data for link previews (titles, descriptions and the pictures
 * messengers and search engines show). Only used by metadata routes and
 * `generateMetadata`, never in the browser.
 */
import type { Metadata } from "next";
import { API_URL } from "./api";
import { formatNumber, plural } from "./plural";

/** Public address of the site, for absolute links in metadata and sitemap. */
export const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://music.vein.guru"
    : "http://localhost:3000")
).replace(/\/$/, "");

/** The API as seen from the site's server (inside Docker: http://backend:8000). */
const SERVER_API_URL = (process.env.API_INTERNAL_URL || API_URL).replace(
  /\/$/,
  "",
);

/** Previews may lag the profile by a few minutes. */
export const PREVIEW_REVALIDATE = 600;
const TIMEOUT_MS = 4000;

export interface UserPreview {
  username: string;
  display_name: string;
  has_avatar: boolean;
  is_private: boolean;
  indexable: boolean;
  bio: string | null;
  level: number | null;
  rank: string | null;
  scrobbles: number | null;
  top_artist: string | null;
}

export interface ArtistPreview {
  name: string;
  plays: number;
  tracks: number;
  top_track: string | null;
  has_cover: boolean;
}

export interface TrackPreview {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  plays: number;
  has_cover: boolean;
}

export interface SitemapData {
  users: { username: string; updated: string | null }[];
  artists: string[];
  tracks: { id: number; updated: string | null }[];
}

/** JSON from /api/preview/…; null when the backend is down or says 404. */
export async function previewJson<T>(
  path: string,
  revalidate = PREVIEW_REVALIDATE,
): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}/api/preview${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The avatar or cover for a preview card as a data URL, or null. */
export async function previewImage(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}/api/preview${path}/image`, {
      next: { revalidate: PREVIEW_REVALIDATE },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !/^image\/(png|jpeg|gif)$/.test(type)) return null;
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${data}`;
  } catch {
    return null;
  }
}

export const plays = (n: number) =>
  `${formatNumber(n)} ${plural(n, "прослушивание", "прослушивания", "прослушиваний")}`;

export const tracksCount = (n: number) =>
  `${formatNumber(n)} ${plural(n, "трек", "трека", "треков")}`;

/** Open Graph fields every page repeats (child metadata replaces the parent's). */
export function openGraph(
  title: string,
  description: string,
  path: string,
  type: "website" | "profile" | "music.song" = "website",
): NonNullable<Metadata["openGraph"]> {
  return {
    title,
    description,
    url: `${SITE_URL}${path}`,
    siteName: "VEINMusic",
    locale: "ru_RU",
    type,
  };
}

export const NO_INDEX: Metadata["robots"] = { index: false, follow: false };

/** Cut text to `max` characters on a word boundary, adding an ellipsis. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
