"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { API_URL } from "@/app/lib/api";
import { useVisiblePolling } from "@/app/lib/usePolling";
import { sourceLabel } from "@/utils/formatters";
import {
  Avatar,
  EmptyState,
  Loading,
  PageHeader,
  PlayingBars,
  Segmented,
} from "@/components/ui";

interface FeedItem {
  id: number;
  username: string;
  avatar_url?: string;
  cover_url?: string;
  relative_time: string;
  title: string;
  artist: string;
  source?: string;
  is_playing?: boolean;
}

function matchesSource(source: string, selectedSource: string): boolean {
  if (selectedSource === "all") return true;
  const s = source.toLowerCase();
  if (selectedSource === "extension")
    return s.includes("extension") || s.includes("web");
  return s.includes(selectedSource);
}

function matchesSearchQuery(item: FeedItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return Boolean(
    item.title?.toLowerCase().includes(q) ||
    item.artist?.toLowerCase().includes(q) ||
    item.username?.toLowerCase().includes(q),
  );
}

const SOURCES = [
  { id: "all", label: "Все" },
  { id: "yandex", label: "Яндекс" },
  { id: "spotify", label: "Spotify" },
  { id: "desktop", label: "Приложение" },
  { id: "extension", label: "Браузер" },
];

export default function GlobalFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/global-history`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setFeed(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Every 20 s while auto-refresh is on and the tab is visible (auto-refresh
  // starts on, so this also does the first load)
  useVisiblePolling(fetchFeed, 20000, autoRefresh);

  const filteredFeed = useMemo(() => {
    const q = searchQuery.trim();
    return feed.filter(
      (item) =>
        matchesSource(item.source || "", selectedSource) &&
        matchesSearchQuery(item, q),
    );
  }, [feed, selectedSource, searchQuery]);

  let list: React.ReactNode;
  if (loading) list = <Loading label="Загружаем ленту…" />;
  else if (filteredFeed.length === 0)
    list = (
      <EmptyState title="Ничего не найдено">
        Попробуйте другой фильтр или запрос.
      </EmptyState>
    );
  else
    list = (
      <ol className="border-t border-line-soft">
        {filteredFeed.map((s) => {
          const cover = sanitizeImageUrl(s.cover_url);
          return (
            <li
              key={s.id}
              className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 border-b border-line-soft px-1 py-3"
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <span className="h-12 w-12 rounded bg-surface-2" />
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  {s.is_playing && (
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-accent">
                      <PlayingBars /> играет
                    </span>
                  )}
                  <span className="truncate text-[15px] font-medium">
                    {s.title}
                  </span>
                </span>
                <span className="truncate text-[13px] text-fg-2">
                  {s.artist}
                </span>
              </div>
              <Link
                href={`/user/${s.username}`}
                className="flex min-w-0 items-center gap-2"
              >
                <Avatar src={s.avatar_url} seed={s.username} size={28} />
                <span className="hidden min-w-0 flex-col sm:flex">
                  <span className="truncate text-[13px]">{s.username}</span>
                  <span className="truncate font-mono text-[11px] text-fg-3">
                    {sourceLabel(s.source)} · {s.relative_time}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    );

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 px-4 py-8 sm:px-8 lg:py-10">
      <PageHeader
        title="Вся лента"
        subtitle="Прослушивания открытых профилей в реальном времени"
        actions={
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-2.5 text-[13px] text-fg-2"
          >
            <span
              className={`relative h-[22px] w-10 rounded-full transition-colors ${autoRefresh ? "bg-accent" : "bg-line"}`}
            >
              <span
                className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${autoRefresh ? "left-[21px] bg-on-accent" : "left-[3px] bg-fg-2"}`}
              />
            </span>
            Автообновление
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-fg-3 focus-within:border-fg-3">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Трек, артист или ник"
            aria-label="Поиск по ленте"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-3 outline-none"
          />
        </label>
        <Segmented
          label="Источник"
          role="radiogroup"
          value={selectedSource}
          onChange={setSelectedSource}
          options={SOURCES}
          className="overflow-x-auto"
        />
      </div>

      {list}
    </div>
  );
}
