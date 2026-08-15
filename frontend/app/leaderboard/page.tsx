"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { LvlBadge, VerifiedBadge } from "../Navbar";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";

interface LeaderboardUser {
  username: string;
  display_name?: string;
  avatar_url?: string;
  avatar_frame?: string;
  role?: string;
  is_verified?: boolean;
  level?: number;
  total_xp?: number;
  total_scrobbles?: number;
  theme?: string;
}

export default function Leaderboard() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/leaderboard`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-4 text-gray-400 font-semibold text-sm">
        <div className="animate-spin border-4 border-[var(--accent)] border-t-transparent rounded-full w-10 h-10" />
        Составляем списки лучших...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pt-8 pb-20 min-h-screen">
      {/* Hero Header */}
      <div className="relative rounded-3xl bg-gradient-to-b from-[#141724] to-[#0d0f17] border border-white/[0.08] p-8 md:p-12 text-center mb-8 shadow-2xl overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
            <Trophy className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-2">
            Зал Славы
          </h1>
          <p className="text-gray-400 font-medium text-xs md:text-sm max-w-sm">
            Топ самых активных и преданных слушателей VEIN Music
          </p>
        </div>
      </div>

      {/* Leaderboard List */}
      <div className="glass-panel rounded-3xl p-4 md:p-6 shadow-2xl border border-white/[0.08]">
        {users.length === 0 ? (
          <div className="text-center text-gray-500 py-12 font-semibold text-sm">
            Никто еще не слушал музыку. Будь первым!
          </div>
        ) : (
          <ul className="space-y-2.5">
            {users.map((u, idx) => (
              <LeaderboardItem key={u.username} u={u} idx={idx} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LeaderboardItem({
  u,
  idx,
}: Readonly<{ u: LeaderboardUser; idx: number }>) {
  const isTop3 = idx < 3;

  const rankBadge =
    idx === 0 ? (
      <span className="text-xl">🥇</span>
    ) : idx === 1 ? (
      <span className="text-xl">🥈</span>
    ) : idx === 2 ? (
      <span className="text-xl">🥉</span>
    ) : (
      <span className="text-xs font-mono font-bold text-gray-500">
        #{idx + 1}
      </span>
    );

  const safeAvatar = sanitizeImageUrl(u.avatar_url);

  return (
    <li
      className={`glass-card p-3.5 sm:p-4 rounded-2xl flex items-center justify-between transition-all duration-200 group ${
        isTop3
          ? "border-white/15 bg-white/[0.04]"
          : "border-white/[0.05] bg-white/[0.015]"
      }`}
    >
      <div className="flex items-center gap-3.5 sm:gap-4 w-full min-w-0 pr-4">
        <div className="w-7 text-center shrink-0 flex items-center justify-center font-black">
          {rankBadge}
        </div>

        <div className="relative shrink-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-black shadow-md border border-white/10 group-hover:scale-105 transition-transform duration-200">
            <img
              src={
                safeAvatar ||
                `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`
              }
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`;
              }}
              alt="avatar"
            />
          </div>
        </div>

        <div className="truncate">
          <Link
            href={`/user/${u.username}`}
            className="font-bold text-white text-sm sm:text-base hover:text-[var(--accent)] transition-colors truncate flex items-center gap-1"
          >
            <span className="truncate">{u.display_name || u.username}</span>
            <VerifiedBadge
              role={u.role}
              isVerified={u.is_verified}
              sizeClass="w-4 h-4"
            />
            <LvlBadge level={u.level || 1} />
          </Link>
          <div className="text-gray-400 text-xs font-medium mt-0.5 truncate">
            @{u.username}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-extrabold text-white text-sm sm:text-base">
          {(u.total_xp || u.total_scrobbles || 0).toLocaleString()}{" "}
          <span className="text-[10px] text-gray-500 font-semibold uppercase">
            XP
          </span>
        </div>
        <div className="text-[10px] text-gray-400 font-mono mt-0.5">
          LVL {u.level || Math.floor((u.total_xp || 0) / 100) + 1}
        </div>
      </div>
    </li>
  );
}
