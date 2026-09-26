"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { VerifiedBadge } from "@/components/UserBadges";
import type { NavUser } from "./types";

const itemClass =
  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors";

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
  className = itemClass,
}: Readonly<{
  href: string;
  icon: string;
  label: string;
  onNavigate: () => void;
  className?: string;
}>) {
  return (
    <Link href={href} onClick={onNavigate} className={className}>
      <span className="text-lg opacity-80" aria-hidden="true">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

/** Avatar button with the account dropdown. */
export default function UserMenu({
  username,
  profile,
  onLogout,
}: Readonly<{
  username: string;
  profile: NavUser | null;
  onLogout: () => void;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const avatar =
    profile?.avatar_url ||
    `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`;
  const frameClass = profile?.avatar_frame
    ? `avatar-frame-wrapper avatar-frame-${profile.avatar_frame}`
    : "";
  const isStaff = profile?.role === "developer" || profile?.role === "admin";

  return (
    <div className="relative" ref={ref}>
      <div className={`${frameClass} transition-all duration-300 ml-2`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Меню аккаунта"
          aria-expanded={isOpen}
          aria-controls="navbar-user-menu"
          className="w-10 h-10 rounded-full border-2 border-transparent hover:border-[var(--accent)] transition-all overflow-hidden bg-[#1a1a1a] shadow-md flex items-center justify-center shrink-0"
        >
          <img src={avatar} className="w-full h-full object-cover" alt="" />
        </button>
      </div>
      {isOpen && (
        <div
          id="navbar-user-menu"
          className="absolute right-0 top-[calc(100%+12px)] w-[300px] bg-[#222222] border border-white/5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="p-5 flex flex-col items-center border-b border-white/5 bg-[#1e1e1e]">
            <div className={`${frameClass} mb-3`}>
              <img
                src={avatar}
                className="w-16 h-16 rounded-full object-cover border border-white/10 bg-[#121212]"
                alt=""
              />
            </div>
            <div className="text-white font-bold text-lg flex items-center justify-center w-full truncate">
              <span className="truncate">
                {profile?.display_name || username}
              </span>
              {profile && (
                <VerifiedBadge
                  role={profile.role}
                  isVerified={profile.is_verified}
                  sizeClass="w-5 h-5"
                />
              )}
            </div>
            <div className="text-gray-400 text-xs mt-0.5">@{username}</div>
            <Link
              href={`/user/${username}`}
              onClick={close}
              className="mt-4 w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2 rounded-lg text-center transition-colors border border-white/5"
            >
              Мой профиль
            </Link>
          </div>
          <nav aria-label="Аккаунт" className="p-2 flex flex-col gap-0.5">
            <MenuLink
              href={`/user/${username}/stats`}
              icon="📊"
              label="Статистика"
              onNavigate={close}
            />
            <MenuLink
              href={`/user/${username}/achievements`}
              icon="🏆"
              label="Достижения"
              onNavigate={close}
            />
            <MenuLink
              href="/settings"
              icon="⚙️"
              label="Настройки"
              onNavigate={close}
            />
            {isStaff && (
              <MenuLink
                href="/admin"
                icon="🛡️"
                label="Админка"
                onNavigate={close}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border border-transparent border-t-white/5"
              />
            )}
          </nav>
          <div className="p-2 border-t border-white/5 bg-[#1a1a1a]">
            <button
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <span className="text-lg opacity-80" aria-hidden="true">
                🚪
              </span>
              <span className="font-medium">Выход</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
