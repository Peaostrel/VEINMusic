"use client";

import { LvlBadge, VerifiedBadge } from "@/components/UserBadges";
import { fallbackOnce } from "@/app/lib/img";
import type { useRouter } from "next/navigation";
import type { UserCard } from "@/app/lib/types";

export function FollowModalContent({
  loading,
  users,
  router,
  onClose,
}: Readonly<{
  loading: boolean;
  users: UserCard[];
  router: ReturnType<typeof useRouter>;
  onClose: () => void;
}>) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center text-[var(--accent-text)] py-10 font-bold animate-pulse">
        <div className="animate-spin border-3 border-[var(--accent-text)] border-t-transparent rounded-full w-8 h-8"></div>
        Загрузка...
      </div>
    );
  }
  if (users.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10 font-medium">
        Тут пока пусто.
      </div>
    );
  }
  const fallbackAvatar = (username: string) =>
    `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`;
  return (
    <ul className="space-y-1">
      {users.map((followerUser) => (
        <li key={followerUser.username}>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/user/${followerUser.username}`);
            }}
            className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors group border border-transparent hover:border-white/5 text-left font-normal bg-transparent outline-none block"
          >
            <img
              src={
                followerUser.avatar_url || fallbackAvatar(followerUser.username)
              }
              className="w-10 h-10 rounded-full bg-black object-cover shrink-0 border border-white/10"
              alt={followerUser.display_name}
              onError={fallbackOnce(fallbackAvatar(followerUser.username))}
            />
            <div className="truncate flex-grow">
              <div className="font-bold text-white text-sm truncate flex items-center gap-1 group-hover:text-[var(--accent-text)] transition-colors">
                {followerUser.display_name}
                <VerifiedBadge
                  role={followerUser.role}
                  isVerified={Boolean(followerUser.is_verified)}
                  sizeClass="w-3.5 h-3.5"
                />
                <LvlBadge level={followerUser.level ?? 1} />
              </div>
              <div className="text-xs text-gray-400 truncate">
                @{followerUser.username}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
