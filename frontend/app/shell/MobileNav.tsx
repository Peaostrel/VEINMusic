"use client";

import Link from "next/link";
import { LogoTile } from "@/components/brand";
import NotificationsBell from "@/components/NotificationsBell";
import AccountMenu from "./AccountMenu";
import { navItems } from "./nav";
import type { NavUser } from "./types";

const TAB_IDS = ["feed", "top", "together", "stats", "profile"];
const SHORT_LABEL: Record<string, string> = { together: "Вместе" };

/** Phone header: mark, bell and account button. */
export function MobileTopBar({
  username,
  profile,
  onLogout,
}: Readonly<{
  username: string;
  profile: NavUser | null;
  onLogout: () => void;
}>) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-line-soft bg-bg/95 px-4 backdrop-blur">
      <Link href="/" aria-label="VEINMusic — на главную" className="rounded-md">
        <LogoTile size={28} />
      </Link>
      <div className="flex items-center gap-1">
        <NotificationsBell />
        <AccountMenu
          username={username}
          profile={profile}
          onLogout={onLogout}
          variant="avatar"
        />
      </div>
    </div>
  );
}

/** Phone bottom tab bar with the five main sections. */
export function MobileTabBar({
  username,
  active,
}: Readonly<{ username: string; active: string | null }>) {
  const tabs = navItems(username).filter((i) => TAB_IDS.includes(i.id));
  return (
    <nav
      aria-label="Разделы"
      className="grid grid-cols-5 border-t border-line-soft bg-sidebar px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5"
    >
      {tabs.map((item) => {
        const current = item.id === active;
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] ${
              current ? "text-fg" : "text-fg-3"
            }`}
          >
            <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
            {SHORT_LABEL[item.id] ?? item.label}
          </Link>
        );
      })}
    </nav>
  );
}
