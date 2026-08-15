"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Users, Disc, Trophy, Radio } from "lucide-react";

import { getPlatformIcon } from "../utils/formatters";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import About from "./about/page";

interface FeedItem {
  id: number;
  username: string;
  avatar_url?: string;
  cover_url?: string;
  source: string;
  title: string;
  artist: string;
  likes_count: number;
  comments_count: number;
  listening_with?: string[];
  is_playing?: boolean;
}

interface TasteTwin {
  username: string;
  display_name: string;
  avatar_url?: string;
  match: number;
  common_artists: string[];
}

export default function Home() {
  const [globalHistory, setGlobalHistory] = useState<FeedItem[]>([]);
  const [friendsHistory, setFriendsHistory] = useState<FeedItem[]>([]);
  const [twins, setTwins] = useState<TasteTwin[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFeed, setActiveFeed] = useState<"global" | "friends">("global");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const user = localStorage.getItem("username");
    setUsername(user);

    const fetchFeeds = async () => {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      try {
        const globalRes = await fetch(`${API_URL}/api/global-history`, {
          credentials: "include",
        });
        const globalData = await globalRes.json();
        setGlobalHistory(Array.isArray(globalData) ? globalData : []);

        if (user) {
          const friendsRes = await fetch(
            `${API_URL}/api/friends-history/${user}`,
            { credentials: "include" },
          );
          const friendsData = await friendsRes.json();
          setFriendsHistory(Array.isArray(friendsData) ? friendsData : []);

          const twinsRes = await fetch(
            `${API_URL}/api/discovery/taste-twins?username=${user}`,
            { credentials: "include" },
          );
          const twinsData = await twinsRes.json();
          setTwins(Array.isArray(twinsData) ? twinsData : []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchFeeds();
    const interval = setInterval(fetchFeeds, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleLike = async (e: React.MouseEvent, scrobbleId: number) => {
    e.stopPropagation();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    try {
      await fetch(`${API_URL}/api/scrobble/${scrobbleId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const rawFeed = activeFeed === "global" ? globalHistory : friendsHistory;
  const currentFeed = Array.isArray(rawFeed) ? rawFeed : [];

  if (!username && !loading) {
    return <About />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 pb-20">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#10131f] via-[#121422] to-[#1a1322] border border-white/[0.08] p-6 sm:p-10 mb-10 shadow-2xl">
        {/* Subtle Ambient Halo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-bold text-gray-300 mb-3 tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Activity Stream
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
              Лента активности
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm max-w-md font-medium">
              Слушай вместе с друзьями, открывай новые треки и следи за живым
              потоком музыки.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {username && (
              <Link
                href={`/user/${username}`}
                className="bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10 font-bold px-5 py-2.5 rounded-xl transition-all shadow-md text-xs sm:text-sm flex items-center gap-2 backdrop-blur-md"
              >
                <span>👤</span>
                Мой Профиль
              </Link>
            )}
            <Link
              href="/leaderboard"
              className="bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-white/5 font-bold px-5 py-2.5 rounded-xl transition-all text-xs sm:text-sm flex items-center gap-2"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              Зал славы
            </Link>
          </div>
        </div>
      </div>

      {/* Main Container: Feed + Sidebar */}
      <div>
        {/* Navigation Tabs Switcher */}
        <div className="flex items-center gap-2 mb-8 bg-[#0e1017] p-1.5 rounded-2xl border border-white/[0.06] w-fit">
          <button
            type="button"
            onClick={() => setActiveFeed("global")}
            className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeFeed === "global"
                ? "bg-white/[0.12] text-white shadow-sm border border-white/10"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Глобальная лента
          </button>
          {username && (
            <button
              type="button"
              onClick={() => setActiveFeed("friends")}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeFeed === "friends"
                  ? "bg-white/[0.12] text-white shadow-sm border border-white/10"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Лента друзей
              {activeFeed === "friends" && (
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              )}
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Left: Feed List */}
          <div className="flex-grow w-full">
            {(() => {
              if (loading) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="h-28 bg-[#11131c]/60 border border-white/5 rounded-2xl animate-pulse"
                      />
                    ))}
                  </div>
                );
              }

              if (activeFeed === "friends" && friendsHistory.length === 0) {
                return (
                  <div className="bg-[#0f1118]/80 border border-white/[0.06] p-12 rounded-3xl text-center">
                    <Radio className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">
                      Здесь пока тихо
                    </h3>
                    <p className="text-gray-400 text-xs">
                      Подпишись на других пользователей, чтобы видеть их треки в
                      ленте друзей!
                    </p>
                  </div>
                );
              }

              if (currentFeed.length === 0) {
                return (
                  <div className="bg-[#0f1118]/80 border border-white/[0.06] p-12 rounded-3xl text-center">
                    <Disc className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">
                      Пока нет активных прослушиваний
                    </h3>
                    <p className="text-gray-400 text-xs">
                      Включай музыку в любимом плеере или браузере!
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AnimatePresence mode="popLayout">
                    {currentFeed.map((item, idx) => {
                      const safeCover = sanitizeImageUrl(item.cover_url);
                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={item.id || idx}
                          className="glass-card p-4 rounded-2xl flex flex-col justify-between group cursor-pointer relative overflow-hidden"
                          onClick={() => {
                            globalThis.location.href = `/user/${item.username}`;
                          }}
                        >
                          <div className="flex items-center gap-3.5">
                            {/* Artwork Cover with Playing Equalizer */}
                            <div className="w-14 h-14 bg-[#0a0b10] rounded-xl overflow-hidden shrink-0 shadow-lg relative border border-white/[0.06]">
                              {safeCover ? (
                                <img
                                  src={safeCover}
                                  alt="Cover"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#1c1e29] to-[#0d0f15] flex items-center justify-center text-gray-500">
                                  <Disc className="w-6 h-6 text-gray-500" />
                                </div>
                              )}
                              {item.is_playing && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center gap-1 rounded-xl">
                                  <div className="w-1 bg-[var(--accent)] rounded-full animate-eq-1" />
                                  <div className="w-1 bg-[var(--accent)] rounded-full animate-eq-2" />
                                  <div className="w-1 bg-[var(--accent)] rounded-full animate-eq-3" />
                                </div>
                              )}
                            </div>

                            {/* Title & Metadata */}
                            <div className="truncate flex-grow min-w-0">
                              <div className="font-bold text-white text-sm truncate group-hover:text-[var(--accent)] transition-colors flex items-center gap-1.5">
                                {getPlatformIcon(item.source)}
                                <span className="truncate">{item.title}</span>
                              </div>
                              <div className="text-xs text-gray-400 truncate mb-1">
                                {item.artist}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-gray-400 font-semibold truncate">
                                  @{item.username}
                                </div>
                                {item.listening_with &&
                                  item.listening_with.length > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--accent-text)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full border border-[var(--accent)]/20">
                                      <Users className="w-2.5 h-2.5" />
                                      Слушает с {item.listening_with[0]}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>

                          {/* Social Actions Bottom Bar */}
                          <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] mt-3">
                            <div className="flex items-center gap-4">
                              <button
                                type="button"
                                onClick={(e) => toggleLike(e, item.id)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    item.likes_count > 0
                                      ? "fill-rose-500 text-rose-500"
                                      : ""
                                  }`}
                                />
                                <span>{item.likes_count || 0}</span>
                              </button>
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>{item.comments_count || 0}</span>
                              </div>
                            </div>

                            <span className="text-[10px] text-gray-400 uppercase font-mono tracking-wider">
                              {item.source || "Web"}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              );
            })()}
          </div>

          {/* Right Sidebar: Taste Twins */}
          <div className="w-full lg:w-80 shrink-0 space-y-6">
            {username && twins.length > 0 && (
              <div className="glass-panel rounded-3xl p-6 shadow-xl sticky top-20 border border-white/[0.08]">
                <h3 className="text-sm font-extrabold text-white mb-5 flex items-center gap-2 uppercase tracking-wider">
                  <Users className="w-4 h-4 text-[var(--accent)]" /> Taste Twins
                </h3>
                <div className="space-y-4">
                  {twins.map((twin) => {
                    const safeAvatar = sanitizeImageUrl(twin.avatar_url);
                    return (
                      <Link
                        href={`/user/${twin.username}`}
                        key={twin.username}
                        className="block p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] transition-all group"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 group-hover:border-[var(--accent)] transition-all shrink-0">
                            <img
                              src={
                                safeAvatar ||
                                `https://api.dicebear.com/9.x/micah/svg?seed=${twin.username}&backgroundColor=transparent`
                              }
                              className="w-full h-full object-cover"
                              alt="Avatar"
                            />
                          </div>
                          <div className="flex-grow min-w-0">
                            <div className="font-bold text-xs text-white group-hover:text-[var(--accent)] transition-colors truncate">
                              {twin.display_name}
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium truncate">
                              @{twin.username}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-lg border border-[var(--accent)]/20">
                              {twin.match}%
                            </span>
                          </div>
                        </div>
                        {twin.common_artists?.length > 0 && (
                          <div className="text-[11px] text-gray-400 truncate">
                            Общие: {twin.common_artists.slice(0, 3).join(", ")}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
