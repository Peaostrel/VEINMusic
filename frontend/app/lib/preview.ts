/**
 * Server-side data for link previews (titles, descriptions and the pictures
 * messengers and search engines show). Only used by metadata routes and
 * `generateMetadata`, never in the browser.
 */
import type { Metadata } from "next";
import { cache } from "react";
import { API_URL } from "./api";
import { makeTranslator, type Lang, type Translator } from "./i18n/core";

/** Russian translator: the default of the helpers below for callers that
 * pass none (server code gets the visitor's one from `getT()`). */
const RU = makeTranslator("ru", null);

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
  /** false: nobody has a counted play yet (not offered to search engines) */
  indexable?: boolean;
}

export interface TrackPreview {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  plays: number;
  has_cover: boolean;
  /** false: nobody has a counted play yet (not offered to search engines) */
  indexable?: boolean;
}

export interface SitemapData {
  users: { username: string; updated: string | null }[];
  artists: string[];
  tracks: { id: number; updated: string | null }[];
}

/** JSON from /api/preview/…; null when the backend is down or says 404. */
export function previewJson<T>(path: string): Promise<T | null> {
  // The backend rechecks privacy before reading its own aggregate cache.
  return apiJson<T>(`/api/preview${path}`, { cache: "no-store" }, TIMEOUT_MS);
}

/** JSON from the API as seen from the site's server; null on any failure. */
async function apiJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Public JSON of the API (no session); null when the API is slow, down or
 * says no. `revalidate` shares the answer between visitors for that many
 * seconds: only for data no privacy setting can hide, since a shared copy
 * would outlive a change of those settings. Without it every request asks
 * the API, which rechecks privacy itself.
 */
export function publicApiJson<T>(
  path: string,
  revalidate?: number,
): Promise<T | null> {
  return apiJson<T>(
    path,
    revalidate ? { next: { revalidate } } : { cache: "no-store" },
    1500,
  );
}

/**
 * previewJson remembered for one request, so `generateMetadata` and the
 * layout's structured data share one call to the API.
 */
export const requestPreviewJson = cache(previewJson) as typeof previewJson;

/** The avatar or cover for a preview card as a data URL, or null. */
export async function previewImage(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}/api/preview${path}/image`, {
      cache: "no-store",
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

export const plays = (n: number, t: Translator = RU) =>
  `${t.number(n)} ${t.plural(n, "прослушивание", "прослушивания", "прослушиваний")}`;

export const tracksCount = (n: number, t: Translator = RU) =>
  `${t.number(n)} ${t.plural(n, "трек", "трека", "треков")}`;

/** Open Graph fields every page repeats (child metadata replaces the parent's). */
export function openGraph(
  title: string,
  description: string,
  path: string,
  type: "website" | "profile" | "music.song" = "website",
  lang: Lang = "ru",
): NonNullable<Metadata["openGraph"]> {
  return {
    title,
    description,
    url: `${SITE_URL}${path}`,
    siteName: "VEINMusic",
    locale: lang === "en" ? "en_US" : "ru_RU",
    type,
  };
}

/** Title, description, canonical link and preview of a static page. */
export function pageMetadata(
  title: string,
  description: string,
  path: string,
  lang: Lang = "ru",
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraph(title, description, path, "website", lang),
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
