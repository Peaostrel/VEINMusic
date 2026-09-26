"use client";

import Link from "next/link";
import { BrandLink } from "@/components/brand";
import NotificationsBell from "@/components/NotificationsBell";
import AccountMenu from "./AccountMenu";
import NowPlaying from "./NowPlaying";
import UserSearch from "./UserSearch";
import { isStaff, navItems } from "./nav";
import type { NavUser } from "./types";

/** Left sidebar of the signed-in desktop layout. */
export default function Sidebar({
  username,
  profile,
  active,
  onLogout,
}: Readonly<{
  username: string;
  profile: NavUser | null;
  active: string | null;
  onLogout: () => void;
}>) {
  const items = navItems(username).filter(
    (i) => !i.staffOnly || isStaff(profile?.role),
  );
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-6">
      <div className="flex items-center justify-between pl-2">
        <BrandLink />
        <NotificationsBell align="left" />
      </div>

      <UserSearch id="sidebar-search" />

      <nav aria-label="Разделы" className="flex flex-col gap-0.5">
        {items.map((item) => {
          const current = item.id === active;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors ${
                current
                  ? "bg-surface-2 font-medium text-fg"
                  : "text-fg-2 hover:bg-surface-2/60 hover:text-fg"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <NowPlaying username={username} />

      <AccountMenu
        username={username}
        profile={profile}
        onLogout={onLogout}
        variant="chip"
      />
    </div>
  );
}
