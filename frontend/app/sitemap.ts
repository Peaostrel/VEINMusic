import type { MetadataRoute } from "next";
import { SITE_URL, previewJson, type SitemapData } from "./lib/preview";

// Built on request, not at build time (the API isn't reachable then); the
// API caches aggregates under the current public audience, so privacy changes
// take effect on the next request without caching an outdated list in Next.js.
export const dynamic = "force-dynamic";

const STATIC_PAGES = [
  "/",
  "/about",
  "/leaderboard",
  "/developers",
  "/privacy",
  "/terms",
];

const date = (value: string | null) => (value ? new Date(value) : undefined);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency:
      path === "/" || path === "/leaderboard" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
  // Public profiles, artists and tracks; only the static pages if the API is down
  const data = await previewJson<SitemapData>("/sitemap");
  if (!data) return pages;
  return [
    ...pages,
    ...data.users.map((u) => ({
      url: `${SITE_URL}/user/${encodeURIComponent(u.username)}`,
      lastModified: date(u.updated),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...data.artists.map((name) => ({
      url: `${SITE_URL}/artist/${encodeURIComponent(name)}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...data.tracks.map((t) => ({
      url: `${SITE_URL}/track/${t.id}`,
      lastModified: date(t.updated),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
