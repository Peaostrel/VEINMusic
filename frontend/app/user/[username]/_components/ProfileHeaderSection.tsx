"use client";

import { VerifiedBadge } from "@/components/UserBadges";
import { fallbackOnce } from "@/app/lib/img";
import type { useRouter } from "next/navigation";
import type { AchievementInfo, MoodInfo, UserInfo } from "@/app/lib/types";

export interface ProfileHeaderSectionProps {
  u: UserInfo;
  username: string;
  fallbackAvatar: string;
  currentLevel: number;
  rankTitle: string;
  mood: MoodInfo | null;
  followers: number;
  following: number;
  openFollowModal: (type: string) => void;
  displayedAchs: AchievementInfo[];
  router: ReturnType<typeof useRouter>;
}

export function ProfileHeaderSection({
  u,
  username,
  fallbackAvatar,
  currentLevel,
  rankTitle,
  mood,
  followers,
  following,
  openFollowModal,
  displayedAchs,
  router,
}: Readonly<ProfileHeaderSectionProps>) {
  return (
    <div className="px-6 md:px-10 pb-8 pt-0 flex flex-col md:flex-row items-center md:items-start md:gap-8 relative z-10">
      <div className="relative shrink-0 z-20 -mt-20 md:-mt-24 mb-4 md:mb-0 group flex flex-col items-center">
        {/* Пульсирующая рамка/свечение */}
        <div className="absolute top-0 rounded-full w-32 h-32 md:w-40 md:h-40 bg-[var(--accent)] shadow-[0_0_40px_var(--accent-glow)] blur-lg animate-pulse opacity-40"></div>

        <div className="relative w-32 h-32 md:w-40 md:h-40 bg-[#1e1e1e] rounded-full overflow-hidden border-[6px] border-[#121212] shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-all duration-500 z-10 group-hover:border-[#1a1a1a]">
          <img
            src={u.avatar_url || fallbackAvatar}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            alt={u.display_name}
            onError={fallbackOnce(fallbackAvatar)}
          />
        </div>
        {/* Лэвел Бейдж */}
        <div className="relative -mt-4 bg-[#121212] border-2 border-[var(--accent)] text-gray-200 px-4 py-1.5 rounded-full text-[11px] md:text-xs font-black shadow-xl whitespace-nowrap flex items-center gap-2 z-20">
          <span>LVL {currentLevel}</span> <span className="opacity-50">|</span>{" "}
          <span className="uppercase tracking-widest">{rankTitle}</span>
        </div>
      </div>

      <div className="text-center md:text-left z-10 flex-grow w-full md:pt-4 min-w-0">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-wide mb-1 flex items-center justify-center md:justify-start">
          {u.display_name}{" "}
          <VerifiedBadge
            role={u.role}
            isVerified={u.is_verified}
            sizeClass="w-8 h-8 md:w-10 md:h-10"
          />
        </h1>

        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
          <p className="text-[var(--accent-text)] font-bold text-sm">
            @{username}
          </p>
          {mood && (
            <div
              className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-tighter text-white"
              title="Настроение прослушивания"
            >
              <span>{mood.emoji}</span> {mood.mood}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 bg-black/50 px-2 py-1 rounded-md border border-white/5">
            <button
              type="button"
              onClick={() => openFollowModal("followers")}
              className="hover:text-white transition-colors cursor-pointer bg-transparent border-none outline-none font-bold text-xs p-0 m-0 block"
              title="Посмотреть подписчиков"
            >
              {followers} подписчиков
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => openFollowModal("following")}
              className="hover:text-white transition-colors cursor-pointer bg-transparent border-none outline-none font-bold text-xs p-0 m-0 block"
              title="Посмотреть подписки"
            >
              {following} подписок
            </button>
          </div>

          {u.streak > 0 && (
            <div
              className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-md border transition-all ${u.streak >= 7 ? "bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse" : "bg-[#121212]/80 text-orange-500 border-orange-500/20"}`}
              title="Дней подряд (минимум 5 треков в день)"
            >
              <span className="animate-fire">🔥</span> {u.streak}
            </div>
          )}
        </div>

        <p className="text-gray-300 italic max-w-2xl bg-[#121212]/60 p-4 rounded-lg border-l-2 border-[var(--accent)] mb-4 shadow-inner">
          {u.bio}
        </p>

        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 relative">
            {displayedAchs.map((a) => (
              <div
                key={a.id}
                className="group relative flex items-center gap-2 bg-[#121212]/80 px-3 py-1.5 rounded-lg border border-white/5 hover:border-[var(--accent)] transition-all cursor-help shadow-md hover:shadow-[0_0_15px_var(--accent-glow)]"
              >
                {a.target_image ? (
                  <img
                    src={a.target_image}
                    alt={a.name}
                    className="w-7 h-7 rounded object-cover shadow-[0_0_8px_var(--accent-glow)] group-hover:scale-110 transition-transform shrink-0"
                  />
                ) : (
                  <span className="text-2xl drop-shadow-[0_0_8px_var(--accent-glow)] group-hover:scale-110 transition-transform">
                    {a.icon}
                  </span>
                )}
                <span className="text-xs font-black text-white uppercase tracking-wider leading-none group-hover:text-[var(--accent-text)] transition-colors">
                  {a.name}
                </span>

                <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-max max-w-[280px] bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 p-2.5 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  {a.rule_target?.startsWith("http") ? (
                    <a
                      href={a.rule_target}
                      target="_blank"
                      rel="noopener noreferrer"

                      className="flex items-center gap-3 group/link"
                    >
                      {a.target_image && (
                        <img
                          src={a.target_image}
                          className="w-10 h-10 rounded object-cover shadow-md shrink-0 border border-white/5 group-hover/link:border-[var(--accent)] transition-colors"
                          alt={a.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-white group-hover/link:text-[var(--accent-text)] transition-colors leading-tight mb-0.5">
                          {a.name}
                        </span>
                        <span className="text-[10px] text-gray-300 font-medium leading-snug whitespace-normal">
                          {a.description}
                        </span>
                        {a.reward_xp > 0 && (
                          <span className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">
                            +{a.reward_xp} XP
                          </span>
                        )}
                      </div>
                    </a>
                  ) : (
                    <div className="flex items-center gap-3">
                      {a.target_image && (
                        <img
                          src={a.target_image}
                          className="w-10 h-10 rounded object-cover shadow-md shrink-0 border border-white/5"
                          alt={a.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-white leading-tight mb-0.5">
                          {a.name}
                        </span>
                        <span className="text-[10px] text-gray-300 font-medium leading-snug whitespace-normal">
                          {a.description}
                        </span>
                        {a.reward_xp > 0 && (
                          <span className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">
                            +{a.reward_xp} XP
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#1a1a1a]/95"></div>
                </div>
              </div>
            ))}

            {u.achievements?.length > 0 && (
              <button
                type="button"
                onClick={() => router.push(`/user/${username}/achievements`)}
                className="bg-[#121212]/80 hover:bg-white/10 text-[10px] font-bold text-gray-400 px-3 py-2 rounded-lg transition-colors border border-white/5 uppercase tracking-widest ml-2"
              >
                Все достижения
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
