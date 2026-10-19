import { publicApiJson } from "@/app/lib/preview";
import type { FeedItem, LandingData, PublicStats, Week } from "./AboutView";

/**
 * The landing's numbers, week and feed read on the server, so they are in
 * the first HTML instead of loading after it (no placeholders jumping).
 */
export async function landingData(): Promise<LandingData> {
  const [stats, week, data] = await Promise.all([
    // Site-wide counts only: safe to share for a while
    publicApiJson<PublicStats>("/api/public-stats", 30),
    // Built from public profiles: the API rechecks privacy on each request
    publicApiJson<Week>("/api/public-stats/week"),
    publicApiJson<{ feed: FeedItem[] }>("/api/feed/global"),
  ]);
  return {
    stats,
    week,
    feed: Array.isArray(data?.feed) ? data.feed : null,
  };
}
