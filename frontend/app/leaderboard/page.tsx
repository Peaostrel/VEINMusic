"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { THEMES, LvlBadge, VerifiedBadge } from "../Navbar";

export default function Leaderboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/leaderboard`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-4 font-bold text-2xl text-[var(--accent-text)] animate-pulse">
        <div className="animate-spin border-4 border-[var(--accent-text)] border-t-transparent rounded-full w-12 h-12"></div>
        Составляем списки лучших...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pt-24 min-h-screen">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black text-white drop-shadow-[0_0_15px_var(--accent-glow)] mb-3">
          Зал Славы
        </h1>
        <p className="text-gray-400 font-medium">
          Самые активные слушатели VEIN Music
        </p>
      </div>

      <div className="bg-[#121212]/60 backdrop-blur-xl border border-white/5 rounded-3xl p-4 md:p-6 shadow-2xl">
        {users.length === 0 ? (
          <div className="text-center text-gray-500 py-10 font-bold">
            Никто еще не слушал музыку. Будь первым!
          </div>
        ) : (
          <ul className="space-y-3">
            {users.map((u, idx) => (
              <LeaderboardItem key={u.username} u={u} idx={idx} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const RANK_CROWNS = ["👑", "🥈", "🥉"];
const RANK_CLASSES = [
  "text-3xl drop-shadow-[0_0_10px_#ffcc00]",
  "text-2xl drop-shadow-[0_0_10px_#ccc]",
  "text-xl drop-shadow-[0_0_10px_#cd7f32]",
];

function getGlowColor(theme: string): string {
  if (theme?.startsWith("#")) return theme;
  return THEMES[theme as keyof typeof THEMES]?.main || "#ffcc00";
}

function getLeaderboardItemStyles(u: any, idx: number) {
  const isTop3 = idx < 3;
  const isHighLevel = u.level >= 50;
  const isRainbow = u.theme === "rainbow";
  const glowColor =
    isHighLevel && !isRainbow ? getGlowColor(u.theme) : "transparent";

  let itemClass = isTop3
    ? "bg-white/10 border-white/20"
    : "bg-white/5 border-transparent";
  if (isRainbow && isHighLevel) {
    itemClass += " theme-rainbow";
  }

  let itemStyle = {};
  if (isHighLevel && !isRainbow) {
    itemStyle = {
      boxShadow: `0 0 15px ${glowColor}30`,
      borderColor: `${glowColor}50`,
    };
  }

  let avatarClass = isTop3 ? "w-14 h-14" : "w-10 h-10";
  if (!(isHighLevel && !isRainbow)) {
    avatarClass += " border-transparent";
  }

  let avatarStyle = {};
  if (isHighLevel && !isRainbow) {
    avatarStyle = { borderColor: glowColor };
  }

  return {
    itemClass,
    itemStyle,
    avatarClass,
    avatarStyle,
    glowColor,
  };
}

function LeaderboardItem({ u, idx }: Readonly<{ u: any; idx: number }>) {
  const rankCrown = RANK_CROWNS[idx] || `#${idx + 1}`;
  const rankClass = RANK_CLASSES[idx] || "text-gray-500";

  const { itemClass, itemStyle, avatarClass, avatarStyle } =
    getLeaderboardItemStyles(u, idx);

  return (
    <li
      className={`relative p-4 rounded-2xl flex items-center justify-between transition-all duration-300 group ${itemClass} border hover:scale-[1.02] hover:bg-white/10`}
      style={itemStyle}
    >
      <div className="flex items-center gap-4 w-full min-w-0 pr-4">
        <div className={`font-black w-8 text-center shrink-0 ${rankClass}`}>
          {rankCrown}
        </div>

        <div className="relative shrink-0">
          <img
            src={
              u.avatar_url ||
              `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`
            }
            className={`rounded-full object-cover bg-black shadow-md border-2 transition-transform duration-300 group-hover:rotate-6 ${avatarClass}`}
            style={avatarStyle}
            onError={(e) => {
              e.currentTarget.src = `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`;
            }}
            alt="avatar"
          />
        </div>

        <div className="truncate">
          <Link
            href={`/user/${u.username}`}
            className="font-black text-white text-lg hover:text-[var(--accent-text)] transition-colors truncate flex items-center"
          >
            {u.display_name || u.username}
            <VerifiedBadge
              role={u.role}
              isVerified={u.is_verified}
              sizeClass="w-5 h-5"
            />
            <LvlBadge level={u.level} />
          </Link>
          <div className="text-gray-400 text-xs font-medium mt-0.5 truncate">
            @{u.username}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-black text-white text-lg">
          {u.total_xp || u.total_scrobbles || 0}{" "}
          <span className="text-xs text-gray-500 font-normal">XP</span>
        </div>
        <div className="text-[10px] text-gray-500 font-black uppercase tracking-wider mt-0.5">
          LVL {Math.floor((u.total_xp || u.total_scrobbles || 0) / 100) + 1}
        </div>
      </div>
    </li>
  );
}
