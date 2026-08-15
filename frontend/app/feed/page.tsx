"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Radio, Search, Filter, RefreshCw } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";

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

export default function GlobalFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const router = useRouter();

  const fetchFeed = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/global-history`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json();
        setFeed(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
    if (!autoRefresh) return;
    const interval = setInterval(fetchFeed, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredFeed = useMemo(() => {
    const q = searchQuery.trim();
    return feed.filter(
      (item) =>
        matchesSource(item.source || "", selectedSource) &&
        matchesSearchQuery(item, q),
    );
  }, [feed, selectedSource, searchQuery]);

  if (loading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white font-black text-2xl animate-pulse">
        <div className="animate-spin border-4 border-[var(--accent)] border-t-transparent rounded-full w-12 h-12"></div>
        📡 ПОДКЛЮЧЕНИЕ К ПОТОКУ...
      </div>
    );

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter flex items-center gap-3">
            <Radio className="w-8 h-8 text-red-500 animate-pulse" />
            Live Feed
          </h1>
          <p className="text-gray-500 font-bold uppercase text-xs tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>{" "}
            Прямой эфир прослушиваний со всего мира
          </p>
        </div>

        {/* Refresh toggle */}
        <button
          type="button"
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
            autoRefresh
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-white/5 border-white/10 text-gray-400"
          }`}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`}
          />
          {autoRefresh ? "Автообновление ВКЛ" : "Автообновление ВЫКЛ"}
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="glass-panel p-4 rounded-2xl mb-8 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию трека, артисту или @username..."
            className="w-full bg-[#141722]/90 border border-white/[0.08] focus:border-[var(--accent)] rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-white placeholder-gray-500 focus:outline-none transition-all font-medium"
          />
        </div>

        {/* Source Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold custom-scrollbar">
          <span className="text-gray-400 flex items-center gap-1 shrink-0 mr-1 text-[11px] uppercase tracking-wider font-semibold">
            <Filter className="w-3 h-3" /> Источник:
          </span>
          {[
            { id: "all", label: "Все источники" },
            { id: "spotify", label: "Spotify" },
            { id: "yandex", label: "Яндекс Музыка" },
            { id: "desktop", label: "Desktop App" },
            { id: "extension", label: "Браузер" },
          ].map((src) => (
            <button
              key={src.id}
              type="button"
              onClick={() => setSelectedSource(src.id)}
              className={`px-3 py-1.5 rounded-xl shrink-0 transition-all cursor-pointer text-xs font-semibold ${
                selectedSource === src.id
                  ? "bg-white/[0.12] border border-white/20 text-white shadow-sm"
                  : "bg-white/[0.03] hover:bg-white/[0.07] text-gray-400 border border-transparent"
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      {filteredFeed.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center text-gray-400 font-semibold text-sm">
          Ничего не найдено по выбранным фильтрам
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFeed.map((s) => {
            const safeCover = sanitizeImageUrl(s.cover_url);
            const safeAvatar = sanitizeImageUrl(s.avatar_url);
            return (
              <button
                key={s.id}
                type="button"
                className="w-full glass-card p-4 rounded-2xl flex items-center gap-4 text-left font-normal outline-none block group cursor-pointer"
                onClick={() => router.push(`/user/${s.username}`)}
              >
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-xl overflow-hidden shadow-lg border border-white/[0.08] relative bg-[#0d0f15]">
                    {safeCover ? (
                      <img
                        src={safeCover}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        alt="Cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#1c1e29] to-[#0d0f15] flex items-center justify-center text-lg text-gray-500">
                        🎵
                      </div>
                    )}
                    {s.is_playing && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center gap-0.5 rounded-xl">
                        <div className="w-0.5 bg-[var(--accent)] rounded-full animate-eq-1" />
                        <div className="w-0.5 bg-[var(--accent)] rounded-full animate-eq-2" />
                        <div className="w-0.5 bg-[var(--accent)] rounded-full animate-eq-3" />
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-[#0e1017] overflow-hidden bg-black shadow-md">
                    <img
                      src={
                        safeAvatar ||
                        `https://api.dicebear.com/9.x/micah/svg?seed=${s.username}&backgroundColor=transparent`
                      }
                      className="w-full h-full object-cover bg-[#282828]"
                      onError={(e) =>
                        (e.currentTarget.src = `https://api.dicebear.com/9.x/micah/svg?seed=${s.username}&backgroundColor=transparent`)
                      }
                      alt={`${s.username}'s avatar`}
                    />
                  </div>
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-white text-xs md:text-sm group-hover:text-[var(--accent)] transition-colors truncate">
                      @{s.username}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      • {s.relative_time}
                    </span>
                  </div>
                  <p className="text-white font-bold truncate text-sm md:text-base leading-snug">
                    {s.title}
                  </p>
                  <p className="text-gray-400 text-xs truncate mt-0.5">
                    {s.artist}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  {s.is_playing ? (
                    <div className="bg-emerald-500/10 px-3 py-1 rounded-full text-[10px] font-bold text-emerald-400 uppercase tracking-widest animate-pulse border border-emerald-500/20">
                      Listening Now
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">
                      {s.source || "Web"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
