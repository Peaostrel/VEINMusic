"use client";

import { VerifiedBadge } from "@/components/UserBadges";
import { Avatar, Loading } from "@/components/ui";
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
  if (loading) return <Loading />;
  if (users.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-fg-2">Тут пока пусто.</p>
    );
  }
  return (
    <ul className="flex flex-col">
      {users.map((person) => (
        <li key={person.username}>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/user/${person.username}`);
            }}
            className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-surface-2"
          >
            <Avatar src={person.avatar_url} seed={person.username} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center truncate text-sm font-medium">
                <span className="truncate">{person.display_name}</span>
                <VerifiedBadge
                  role={person.role}
                  isVerified={Boolean(person.is_verified)}
                  sizeClass="w-3.5 h-3.5"
                />
              </span>
              <span className="block truncate font-mono text-[11px] text-fg-3">
                @{person.username} · ур. {person.level ?? 1}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
