"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Radio, Search, Filter, RefreshCw } from "lucide-react";

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
      <div className="bg-[#121216]/80 border border-white/5 p-4 rounded-2xl mb-8 space-y-3 backdrop-blur-md">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию трека, артисту или @username..."
            className="w-full bg-[#1c1c22] border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500 font-medium"
          />
        </div>

        {/* Source Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold custom-scrollbar">
          <span className="text-gray-500 flex items-center gap-1 shrink-0 mr-1 text-[11px] uppercase tracking-wider">
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
              className={`px-3 py-1.5 rounded-lg shrink-0 transition-all cursor-pointer ${
                selectedSource === src.id
                  ? "bg-red-500/20 border border-red-500/40 text-red-400 font-black"
                  : "bg-white/5 hover:bg-white/10 text-gray-400 border border-transparent"
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      {filteredFeed.length === 0 ? (
        <div className="bg-[#121214]/60 border border-white/5 rounded-3xl p-12 text-center text-gray-400 font-bold text-sm">
          Ничего не найдено по выбранным фильтрам
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFeed.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full bg-[#121214]/60 hover:bg-[#18181c] backdrop-blur-md p-4 rounded-2xl border border-white/5 flex items-center gap-4 hover:border-red-500/30 transition-all group cursor-pointer text-left font-normal outline-none block"
              onClick={() => router.push(`/user/${s.username}`)}
            >
              <div className="relative shrink-0">
                {s.cover_url ? (
                  <img
                    src={s.cover_url}
                    className="w-14 h-14 rounded-xl object-cover shadow-lg group-hover:scale-105 transition-transform"
                    alt="Cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-lg text-yellow-500/80 shadow-lg group-hover:scale-105 transition-transform">
                    🎵
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-[#121212] overflow-hidden bg-black">
                  <img
                    src={
                      s.avatar_url ||
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
                  <span className="font-black text-white text-sm group-hover:text-red-400 transition-colors truncate">
                    @{s.username}
                  </span>
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    {s.relative_time}
                  </span>
                </div>
                <p className="text-white font-bold truncate text-base leading-tight">
                  {s.title}
                </p>
                <p className="text-gray-400 text-xs truncate mt-0.5">
                  {s.artist}
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 shrink-0">
                {s.is_playing && (
                  <div className="bg-emerald-500/10 px-3 py-1 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest animate-pulse border border-emerald-500/20">
                    Listening Now
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
